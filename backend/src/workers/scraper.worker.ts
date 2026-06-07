import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queues/scraper.queue';
import { PrismaClient } from '@prisma/client';
import { chromium, Browser } from 'playwright';

const prisma = new PrismaClient();

type TriState = 'any' | 'has' | 'none';

interface RadarFilters {
  phone?: TriState;
  website?: TriState;
  instagram?: TriState;
}

interface ScrapeJobData {
  jobId: string;
  query: string;
  /** Multi-city. Legacy `city` is rolled into here at enqueue time. */
  cities: string[];
  filters?: RadarFilters;
}

const MAX_PLACES_PER_CITY = 15;

// ─────────────────────────────────────────────────────────────────────────
// Helpers — DOM extraction
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse lat/lng/placeId out of the canonical Maps place URL.
 *
 * Example URL:
 *   https://www.google.com/maps/place/Name/@-25.94,32.58,17z/data=!3m1!4b1!4m6!3m5!1s0x1ee69bcd...!8m2!3d-25.94!4d32.58!16s%2Fg%2F1tdwl5_p
 */
function parseMapsUrl(url: string): {
  latitude: number | null;
  longitude: number | null;
  placeId: string | null;
} {
  const out = { latitude: null as number | null, longitude: null as number | null, placeId: null as string | null };
  try {
    // @<lat>,<lng>
    const at = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (at) {
      out.latitude = parseFloat(at[1]);
      out.longitude = parseFloat(at[2]);
    }
    // !1s<placeId>
    const pid = url.match(/!1s([^!]+)/);
    if (pid) out.placeId = decodeURIComponent(pid[1]);
  } catch {
    /* swallow — best effort */
  }
  return out;
}

/**
 * Build a working maps.google.com link.
 *
 * The `!1s` placeId we extract from the URL is a hex FID
 * (`0x...:0x...`), which is NOT accepted by `?q=place_id:` (only
 * ChIJ-format CIDs are). So we never construct that link.
 *
 * Priority:
 *   1. Canonical `/maps/place/` URL — stable and opens the right pin.
 *   2. lat/lng search — works universally when we have coords.
 *   3. text search by "name, city" — last resort when coords missing.
 */
function buildMapsUrl(
  canonicalUrl: string,
  latitude: number | null,
  longitude: number | null,
  name: string,
  city: string,
): string {
  if (canonicalUrl && canonicalUrl.includes('/maps/place/')) return canonicalUrl;
  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  const q = encodeURIComponent([name, city].filter(Boolean).join(', '));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Tri-state filter: 'any' passes, 'has' needs truthy, 'none' needs falsy. */
function passesFilter(state: TriState | undefined, value: unknown): boolean {
  if (!state || state === 'any') return true;
  const truthy = !!value;
  return state === 'has' ? truthy : !truthy;
}

// ─────────────────────────────────────────────────────────────────────────
// Worker
// ─────────────────────────────────────────────────────────────────────────

export const scraperWorker = new Worker<ScrapeJobData>(
  'scraperQueue',
  async (job: Job<ScrapeJobData>) => {
    const { jobId, query, cities, filters } = job.data;
    const cityList = Array.isArray(cities) && cities.length > 0 ? cities : [];
    console.log(
      `[SCRAPER] Iniciando Job ${jobId}: "${query}" em [${cityList.join(', ')}] · filtros=${JSON.stringify(filters || {})}`,
    );

    await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'processing' } });

    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      const page = await browser.newPage();
      const folders = await prisma.scriptFolder.findMany({
        select: { id: true, name: true, scripts: { select: { id: true } } },
      });
      const findScriptIdFor = (folderKeyword: string) => {
        const folder = folders.find((f) => f.name.toLowerCase().includes(folderKeyword));
        return folder && folder.scripts.length > 0 ? folder.scripts[0].id : null;
      };

      for (const city of cityList) {
        console.log(`[SCRAPER] ► Cidade: ${city}`);
        const searchQuery = encodeURIComponent(`${query} em ${city}`);
        await page.goto(`https://www.google.com/maps/search/${searchQuery}/`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
        await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 20000 }).catch(() => {});

        // Scroll 3x for more results
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            const scrollables = document.querySelectorAll('div[role="feed"]');
            if (scrollables.length > 0) scrollables[0].scrollBy(0, 1000);
          });
          await page.waitForTimeout(2000);
        }

        const placeLinks: string[] = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(
            (a) => (a as HTMLAnchorElement).href,
          ),
        );
        const uniqueLinks = [...new Set(placeLinks)].slice(0, MAX_PLACES_PER_CITY);
        console.log(`[SCRAPER]   ${uniqueLinks.length} locais únicos em ${city}`);

        for (const link of uniqueLinks) {
          try {
            await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await page.waitForTimeout(1000);

            // Capture the URL *after* navigation — Maps often canonicalises
            // it (adds placeId, exact lat/lng) once the page settles.
            const finalUrl = page.url();
            const { latitude, longitude, placeId } = parseMapsUrl(finalUrl);

            const details = await page.evaluate(() => {
              const safeText = (el: Element | null) => (el ? (el as HTMLElement).innerText.trim() : null);

              const name = safeText(document.querySelector('h1')) || 'Desconhecido';

              const phoneEl = document.querySelector('button[data-item-id^="phone:"]');
              let phone = safeText(phoneEl);
              if (phone) phone = phone.replace(/[^+\d\s\-()]/g, '').trim();

              const websiteEl = document.querySelector('a[data-item-id^="authority:"]');
              const website = websiteEl ? (websiteEl as HTMLAnchorElement).href : null;

              const addressEl = document.querySelector('button[data-item-id^="address:"]');
              const address = safeText(addressEl);

              // Rating + reviews count: the F7nice block on the place
              // header is the most stable source. Format varies by locale
              // ("4,7 (234)" pt-PT, "4.7 (234)" en, etc.) so parse the
              // first decimal-ish number for rating and the first
              // parenthesised integer for the count.
              const ratingHeaderText = safeText(document.querySelector('div.F7nice')) || '';
              const ratingMatch = ratingHeaderText.match(/(\d+[.,]\d+)/);
              const reviewsMatch = ratingHeaderText.match(/\(([\d.,]+)\)/);
              const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : null;
              const reviewsCount = reviewsMatch
                ? parseInt(reviewsMatch[1].replace(/[^\d]/g, ''), 10) || null
                : null;

              return { name, phone, website, address, rating, reviewsCount };
            });

            // Normalize website vs instagram BEFORE filtering. Small
            // businesses very often list their Instagram as their "website"
            // on Google Maps — that's a social profile, not a real site. We
            // surface it as `instagram` (and treat the website as empty) so
            // BOTH the website filter ("não tem site") and the instagram
            // filter ("tem instagram") behave correctly. Previously Instagram
            // was ONLY ever discovered by crawling an external site, so for
            // the no-website businesses the Radar targets it was almost always
            // null and the instagram filter effectively never matched.
            let website: string | null = details.website;
            let instagram: string | null = null;
            if (website && /instagram\.com/i.test(website)) {
              instagram = website;
              website = null;
            }

            // ── Server-side tri-state filters (before any expensive work) ──
            if (!passesFilter(filters?.phone, details.phone)) {
              console.log(`[SCRAPER]   ✗ phone filter: ${details.name}`);
              continue;
            }
            if (!passesFilter(filters?.website, website)) {
              console.log(`[SCRAPER]   ✗ website filter: ${details.name}`);
              continue;
            }

            // Default classification when there's no website
            let status: string = 'Sem Website';

            // Website probe: classify Sem / Lento / Bom and, as a fallback,
            // extract an Instagram link from the site if we don't have one yet.
            if (website && !website.includes('google.com')) {
              status = 'Website Bom';
              const start = Date.now();
              try {
                const newPage = await browser.newPage();
                const response = await newPage.goto(website, {
                  timeout: 8000,
                  waitUntil: 'domcontentloaded',
                });
                const loadTime = Date.now() - start;
                if (!response || !response.ok()) {
                  status = 'Sem Website';
                } else if (loadTime > 4000) {
                  status = 'Website Lento/Antigo';
                }
                const igFromSite = await newPage.evaluate(() => {
                  const igLink = document.querySelector('a[href*="instagram.com"]');
                  return igLink ? (igLink as HTMLAnchorElement).href : null;
                });
                if (!instagram && igFromSite) instagram = igFromSite;
                await newPage.close();
              } catch {
                status = 'Website Lento/Antigo';
              }
            }

            // Instagram filter — now sourced from the Maps "website" field too,
            // not only from crawling an external site.
            if (!passesFilter(filters?.instagram, instagram)) {
              console.log(`[SCRAPER]   ✗ instagram filter: ${details.name}`);
              continue;
            }

            // Script recommendation (existing keyword-based heuristic)
            let recommendedScriptId: string | null = null;
            if (status === 'Sem Website')
              recommendedScriptId = findScriptIdFor('abordagem') || findScriptIdFor('geral');
            if (status === 'Website Lento/Antigo')
              recommendedScriptId = findScriptIdFor('negociacao') || findScriptIdFor('geral');
            if (status === 'Website Bom')
              recommendedScriptId = findScriptIdFor('fechamento') || findScriptIdFor('geral');

            const mapsUrl = buildMapsUrl(finalUrl, latitude, longitude, details.name, city);

            const lead = await prisma.scrapedLead.create({
              data: {
                jobId,
                name: details.name,
                phone: details.phone || '',
                address: details.address,
                website,
                instagram,
                status,
                recommendedScriptId,
                rating: details.rating,
                reviewsCount: details.reviewsCount,
                mapsUrl,
                placeId,
                latitude,
                longitude,
                city,
              },
            });
            console.log(
              `[SCRAPER]   ✓ ${lead.name} | ${lead.status} | ★${lead.rating ?? '—'} (${lead.reviewsCount ?? '—'})`,
            );
            redisConnection.publish(`job:${jobId}`, JSON.stringify(lead));
          } catch (error) {
            console.error(`[SCRAPER]   ! erro em ${link}`, error);
          }
        }
      }

      await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'completed' } });
      redisConnection.publish(`job:${jobId}`, JSON.stringify({ event: 'COMPLETED' }));
    } catch (error) {
      console.error(`[SCRAPER] Erro fatal no Job ${jobId}`, error);
      await prisma.scrapeJob.update({ where: { id: jobId }, data: { status: 'failed' } });
      redisConnection.publish(`job:${jobId}`, JSON.stringify({ event: 'FAILED' }));
    } finally {
      if (browser) await browser.close();
    }
  },
  { connection: redisConnection },
);
