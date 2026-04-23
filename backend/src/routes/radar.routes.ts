import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

// In-memory job store (in production use Redis/BullMQ)
const jobStore: Map<string, {
  status: 'processing' | 'completed' | 'failed';
  progress: number;
  results: any[];
  error?: string;
}> = new Map();

/**
 * POST /api/radar/search
 * Starts a Google Maps scraping job
 */
router.post('/search', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { query, location } = req.body;

    if (!query || !location) {
      return res.status(400).json({ error: 'Query e localização são obrigatórios' });
    }

    // Rate limiting: 10 searches/day
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const today = new Date().toDateString();
    const lastSearch = user.lastSearchDate ? new Date(user.lastSearchDate).toDateString() : null;
    let searchCount = lastSearch === today ? user.dailySearchCount : 0;

    if (searchCount >= env.MAX_DAILY_SEARCHES) {
      return res.status(429).json({
        error: 'Limite diário atingido',
        message: `Você atingiu o limite de ${env.MAX_DAILY_SEARCHES} buscas por dia. Tente novamente amanhã.`,
        remaining: 0,
      });
    }

    // Increment search count
    await prisma.user.update({
      where: { id: userId },
      data: {
        dailySearchCount: searchCount + 1,
        lastSearchDate: new Date(),
      },
    });

    // Create job
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    jobStore.set(jobId, {
      status: 'processing',
      progress: 0,
      results: [],
    });

    // Run scraping in background
    runScraper(jobId, query, location, userId);

    return res.json({
      jobId,
      status: 'processing',
      remaining: env.MAX_DAILY_SEARCHES - searchCount - 1,
    });
  } catch (error) {
    console.error('[RADAR] Search error:', error);
    return res.status(500).json({ error: 'Erro ao iniciar busca' });
  }
});

/**
 * GET /api/radar/status/:jobId
 * Polling endpoint for scraping job status
 */
router.get('/status/:jobId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado' });
  }

  return res.json({
    jobId,
    status: job.status,
    progress: job.progress,
    resultsCount: job.results.length,
    results: job.status === 'completed' ? job.results : [],
    error: job.error,
  });
});

/**
 * GET /api/radar/leads
 * Returns all leads saved by the user
 */
router.get('/leads', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const leads = await prisma.lead.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return res.json({ leads, total: leads.length });
  } catch (error) {
    console.error('[RADAR] Leads error:', error);
    return res.status(500).json({ error: 'Erro ao carregar leads' });
  }
});

/**
 * Background scraper function
 * Uses Playwright to scrape Google Maps results
 */
async function runScraper(jobId: string, query: string, location: string, userId: string) {
  const job = jobStore.get(jobId);
  if (!job) return;

  try {
    const { chromium } = await import('playwright');

    job.progress = 10;

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    job.progress = 20;

    // Navigate to Google Maps
    const searchQuery = `${query} em ${location}`;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    job.progress = 40;

    // Wait for results to load
    await page.waitForTimeout(3000);

    // Scroll the results panel to load more
    const feedSelector = 'div[role="feed"]';
    try {
      await page.waitForSelector(feedSelector, { timeout: 10000 });

      for (let i = 0; i < 5; i++) {
        await page.evaluate((sel) => {
          const feed = document.querySelector(sel);
          if (feed) feed.scrollTop = feed.scrollHeight;
        }, feedSelector);
        await page.waitForTimeout(2000);
        job.progress = 40 + (i + 1) * 8;
      }
    } catch {
      // Feed might not exist, continue
    }

    job.progress = 80;

    // Extract business data
    const results = await page.evaluate(() => {
      const items: any[] = [];
      const links = document.querySelectorAll('a[href*="/maps/place/"]');

      links.forEach((link) => {
        const container = link.closest('[jsaction]');
        if (!container) return;

        const nameEl = container.querySelector('.fontHeadlineSmall, .qBF1Pd');
        const name = nameEl?.textContent?.trim() || '';

        // Get all text content to find phone numbers
        const allText = container.textContent || '';

        // Phone regex for Mozambique (+258) and general formats
        const phoneMatch = allText.match(/(?:\+258|258)?[\s.-]?(?:8[2-7]|8[2-7])[\s.-]?\d{3}[\s.-]?\d{4}/);
        const generalPhone = allText.match(/(?:\+?\d{1,4}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);
        const phone = phoneMatch?.[0] || generalPhone?.[0] || '';

        // Rating
        const ratingMatch = allText.match(/(\d[.,]\d)\s*\(/);
        const rating = ratingMatch ? parseFloat(ratingMatch[1].replace(',', '.')) : null;

        // Address - usually after the category
        const spans = container.querySelectorAll('span');
        let address = '';
        spans.forEach((span: Element) => {
          const text = span.textContent?.trim() || '';
          if (text.length > 20 && text.includes(',') && !text.includes('·')) {
            address = text;
          }
        });

        // Website
        const websiteLink = container.querySelector('a[href*="http"]:not([href*="google"])');
        const website = websiteLink?.getAttribute('href') || '';

        if (name && phone) {
          items.push({ name, phone: phone.trim(), address, rating, website });
        }
      });

      return items;
    });

    await browser.close();

    // Filter only results with valid phone numbers
    const validResults = results.filter(r => r.phone && r.phone.length >= 8);

    // Remove duplicates
    const seen = new Set();
    const uniqueResults = validResults.filter(r => {
      const key = r.phone.replace(/\D/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    job.progress = 90;

    // Save leads to database
    if (uniqueResults.length > 0) {
      await prisma.lead.createMany({
        data: uniqueResults.map(r => ({
          userId,
          name: r.name,
          phone: r.phone,
          address: r.address || null,
          category: query,
          location,
          rating: r.rating,
          website: r.website || null,
        })),
        skipDuplicates: true,
      });
    }

    job.status = 'completed';
    job.progress = 100;
    job.results = uniqueResults;

    console.log(`[RADAR] ✅ Scraping complete: ${uniqueResults.length} leads found for "${query} em ${location}"`);

  } catch (error: any) {
    console.error(`[RADAR] ❌ Scraping failed for job ${jobId}:`, error.message);
    job.status = 'failed';
    job.error = 'Erro durante a busca. Tente novamente.';
  }
}

export default router;
