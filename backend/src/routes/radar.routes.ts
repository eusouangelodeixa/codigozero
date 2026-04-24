import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import { env } from '../config/env';
import { scraperQueue, redisConnection } from '../queues/scraper.queue';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/radar/start
 * Starts a Google Maps scraping job via BullMQ
 */
router.post('/start', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { query, city } = req.body;

    if (!query || !city) {
      return res.status(400).json({ error: 'Query e localidade (city) são obrigatórios' });
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

    // Create a job record in database
    const dbJob = await prisma.scrapeJob.create({
      data: {
        userId,
        query,
        city,
        status: 'queued'
      }
    });

    // Increment search count
    await prisma.user.update({
      where: { id: userId },
      data: {
        dailySearchCount: searchCount + 1,
        lastSearchDate: new Date(),
      },
    });

    // Add to BullMQ Queue
    await scraperQueue.add('scrape', {
      jobId: dbJob.id,
      query,
      city
    });

    return res.json({
      jobId: dbJob.id,
      status: 'queued',
      remaining: env.MAX_DAILY_SEARCHES - searchCount - 1,
    });
  } catch (error) {
    console.error('[RADAR] Start error:', error);
    return res.status(500).json({ error: 'Erro ao iniciar busca' });
  }
});

/**
 * GET /api/radar/stream/:jobId
 * Server-Sent Events (SSE) to stream leads in real-time
 */
router.get('/stream/:jobId', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params;

  // Setup SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  // Enviar evento inicial de conexão
  res.write(`data: ${JSON.stringify({ event: 'CONNECTED', jobId })}\n\n`);

  // Usar uma conexão Redis duplicada para usar o Pub/Sub sem bloquear a principal
  const subscriber = redisConnection.duplicate();

  subscriber.subscribe(`job:${jobId}`, (err) => {
    if (err) {
      console.error('[SSE] Redis subscribe error:', err);
      res.end();
    }
  });

  subscriber.on('message', (channel, message) => {
    if (channel === `job:${jobId}`) {
      const data = JSON.parse(message);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      
      // Fechar a conexão se o worker avisar que terminou ou falhou
      if (data.event === 'COMPLETED' || data.event === 'FAILED') {
        subscriber.unsubscribe(`job:${jobId}`);
        subscriber.quit();
        res.end();
      }
    }
  });

  // Limpar recursos se o cliente fechar a aba
  req.on('close', () => {
    subscriber.unsubscribe(`job:${jobId}`);
    subscriber.quit();
  });
});

/**
 * GET /api/radar/history
 * Returns user's scrape jobs and leads
 */
router.get('/history', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const jobs = await prisma.scrapeJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { leads: true },
      take: 20,
    });

    return res.json({ jobs });
  } catch (error) {
    console.error('[RADAR] History error:', error);
    return res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

export default router;
