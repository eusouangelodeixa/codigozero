import { Worker, Job } from 'bullmq';
import { redisConnection } from '../queues/scraper.queue';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const prisma = new PrismaClient();

interface ScrapeJobData {
  jobId: string;
  query: string;
  city: string;
}

export const scraperWorker = new Worker<ScrapeJobData>(
  'scraperQueue',
  async (job: Job) => {
    const { jobId, query, city } = job.data;
    console.log(`[SCRAPER] Iniciando Job ${jobId}: ${query} em ${city}`);

    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: 'processing' }
    });

    let browser;
    try {
      browser = await chromium.launch({ 
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      const page = await browser.newPage();
      
      const searchQuery = encodeURIComponent(`${query} em ${city}`);
      await page.goto(`https://www.google.com/maps/search/${searchQuery}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      
      // Esperar que apareçam os resultados
      await page.waitForSelector('a[href*="/maps/place/"]', { timeout: 20000 }).catch(() => {});

      // Scroll para carregar mais resultados (limitamos a 3 scrolls para não demorar muito na demo)
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          const scrollables = document.querySelectorAll('div[role="feed"]');
          if (scrollables.length > 0) {
            scrollables[0].scrollBy(0, 1000);
          }
        });
        await page.waitForTimeout(2000);
      }

      // Extrair links dos locais
      const placeLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/maps/place/"]')).map(a => (a as HTMLAnchorElement).href);
      });

      // Remover duplicados e limitar a 15 para não demorar muito
      const uniqueLinks = [...new Set(placeLinks)].slice(0, 15);
      console.log(`[SCRAPER] Encontrados ${uniqueLinks.length} locais únicos. Extraindo detalhes...`);

      for (const link of uniqueLinks) {
        try {
          await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
          await page.waitForTimeout(1000); // Dar tempo para renderizar os campos
          
          const details = await page.evaluate(() => {
            const nameEl = document.querySelector('h1');
            const name = nameEl ? nameEl.innerText : 'Desconhecido';
            
            // Buscar botoes/textos que contêm telefone, site, morada
            // No Maps novo, os botões têm data-item-id contendo "phone:", "address:", "authority:"
            const phoneEl = document.querySelector('button[data-item-id^="phone:"]');
            let phone = phoneEl ? (phoneEl as HTMLElement).innerText : null;
            if (phone) {
              phone = phone.replace(/[^+\d\s-()]/g, '').trim(); // Remove icons and newlines
            }
            
            const websiteEl = document.querySelector('a[data-item-id^="authority:"]');
            const website = websiteEl ? (websiteEl as HTMLAnchorElement).href : null;
            
            const addressEl = document.querySelector('button[data-item-id^="address:"]');
            const address = addressEl ? (addressEl as HTMLElement).innerText : null;

            return { name, phone, website, address };
          });

          // FILTRO 1: Sem telefone? Descarta.
          if (!details.phone) {
            console.log(`[SCRAPER] Descartado (sem telefone): ${details.name}`);
            continue;
          }

          let status = "Sem Website";
          let instagram: string | null = null;
          let recommendedScriptId: string | null = null;

          // Encontrar o Script "Sem Website" (ex: categoria primeira_abordagem ou algo similar)
          // Vamos procurar dinamicamente um folder que combine com o status
          const folders = await prisma.scriptFolder.findMany({ select: { id: true, name: true, scripts: { select: { id: true } } } });

          // FILTRO 2 & 3: Tem website?
          if (details.website && !details.website.includes('google.com')) {
            status = "Website Bom"; // Assumimos bom por defeito, a não ser que demore muito
            
            const start = Date.now();
            try {
              const newPage = await browser.newPage();
              const response = await newPage.goto(details.website, { timeout: 8000, waitUntil: 'domcontentloaded' });
              const loadTime = Date.now() - start;

              if (!response || !response.ok()) {
                status = "Sem Website"; // Site quebrado
              } else if (loadTime > 4000) {
                status = "Website Lento/Antigo";
              }

              // Procurar Instagram
              instagram = await newPage.evaluate(() => {
                const igLink = document.querySelector('a[href*="instagram.com"]');
                return igLink ? (igLink as HTMLAnchorElement).href : null;
              });

              await newPage.close();
            } catch (e) {
              status = "Website Lento/Antigo"; // Falhou ao abrir = mau site
            }
          }

          // Lógica de Script Recomendado baseado no Status
          const findScriptIdFor = (folderKeyword: string) => {
            const folder = folders.find(f => f.name.toLowerCase().includes(folderKeyword));
            return folder && folder.scripts.length > 0 ? folder.scripts[0].id : null;
          };

          if (status === "Sem Website") recommendedScriptId = findScriptIdFor('abordagem') || findScriptIdFor('geral');
          if (status === "Website Lento/Antigo") recommendedScriptId = findScriptIdFor('negociacao') || findScriptIdFor('geral');
          if (status === "Website Bom") recommendedScriptId = findScriptIdFor('fechamento') || findScriptIdFor('geral');

          // Salvar na DB
          const lead = await prisma.scrapedLead.create({
            data: {
              jobId,
              name: details.name,
              phone: details.phone,
              address: details.address,
              website: details.website,
              instagram,
              status,
              recommendedScriptId
            }
          });

          console.log(`[SCRAPER] Lead Capturado: ${lead.name} | Status: ${lead.status}`);

          // Emitir Evento via Redis Pub/Sub para o SSE
          redisConnection.publish(`job:${jobId}`, JSON.stringify(lead));

        } catch (error) {
          console.error(`[SCRAPER] Erro ao processar link ${link}`, error);
        }
      }

      await prisma.scrapeJob.update({
        where: { id: jobId },
        data: { status: 'completed' }
      });
      
      redisConnection.publish(`job:${jobId}`, JSON.stringify({ event: 'COMPLETED' }));

    } catch (error) {
      console.error(`[SCRAPER] Erro fatal no Job ${jobId}`, error);
      await prisma.scrapeJob.update({
        where: { id: jobId },
        data: { status: 'failed' }
      });
      redisConnection.publish(`job:${jobId}`, JSON.stringify({ event: 'FAILED' }));
    } finally {
      if (browser) await browser.close();
    }
  },
  { connection: redisConnection }
);
