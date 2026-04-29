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

/**
 * GET /api/radar/leads
 * Returns all scraped leads for the user (across all jobs)
 */
router.get('/leads', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const jobs = await prisma.scrapeJob.findMany({
      where: { userId },
      select: { id: true },
    });
    const jobIds = jobs.map(j => j.id);

    const leads = await prisma.scrapedLead.findMany({
      where: { jobId: { in: jobIds } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return res.json({ leads });
  } catch (error) {
    console.error('[RADAR] Leads error:', error);
    return res.status(500).json({ error: 'Erro ao carregar leads' });
  }
});

/**
 * POST /api/radar/dispatch
 * Dispatches WhatsApp messages via the user's Komunika API
 * Supports single or batch dispatch
 * Body: { contacts: [{ phone, name? }], message: string }
 *   OR legacy: { phone, content }
 */
router.post('/dispatch', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { phone, content, contacts, message } = req.body;

    // Normalize to batch format
    const contactList: { phone: string; name?: string; variables?: Record<string, string> }[] = contacts
      ? contacts
      : phone ? [{ phone, name: undefined }] : [];

    const msgContent = message || content;

    if (contactList.length === 0 || !msgContent) {
      return res.status(400).json({ error: 'Contatos e mensagem são obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (!user.komunikaApiKey || !user.komunikaInstanceId) {
      return res.status(400).json({ error: 'KOMUNIKA_NOT_CONFIGURED', message: 'Configure suas credenciais do Komunika na aba Integrações.' });
    }

    const results: { phone: string; name?: string; success: boolean; error?: string }[] = [];
    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

    for (const contact of contactList) {
      const cleanPhone = contact.phone.replace(/\D/g, '');

      // Replace standard variables
      let personalizedMsg = msgContent
        .replace(/\{\{nome\}\}/gi, contact.name || contact.variables?.nome || '')
        .replace(/\{\{telefone\}\}/gi, contact.phone || '')
        .replace(/\{\{negocio\}\}/gi, contact.variables?.negocio || contact.name || '');

      // Replace all custom variables from contact.variables
      if (contact.variables) {
        Object.entries(contact.variables).forEach(([key, val]) => {
          personalizedMsg = personalizedMsg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), val || '');
        });
      }

      try {
        const response = await fetch(`${apiUrl}/api/v1/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': user.komunikaApiKey,
          },
          body: JSON.stringify({ instanceId: user.komunikaInstanceId, to: cleanPhone, type: 'text', content: personalizedMsg }),
        });

        const data = await response.json().catch(() => null);

        if (response.ok) {
          results.push({ phone: contact.phone, name: contact.name, success: true });
          await prisma.dispatchLog.create({
            data: { userId, phone: contact.phone, contactName: contact.name, message: personalizedMsg, status: 'sent' },
          });
        } else {
          const errMsg = data?.error || data?.message || 'Erro Komunika';
          results.push({ phone: contact.phone, name: contact.name, success: false, error: errMsg });
          await prisma.dispatchLog.create({
            data: { userId, phone: contact.phone, contactName: contact.name, message: personalizedMsg, status: 'failed', error: errMsg },
          });
        }
      } catch (err: any) {
        results.push({ phone: contact.phone, name: contact.name, success: false, error: err.message });
        await prisma.dispatchLog.create({
          data: { userId, phone: contact.phone, contactName: contact.name, message: personalizedMsg, status: 'failed', error: err.message },
        });
      }

      // Delay between messages to avoid rate limiting
      if (contactList.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[DISPATCH] User ${user.email}: ${sent} sent, ${failed} failed out of ${contactList.length}`);

    return res.json({ success: true, sent, failed, total: contactList.length, results });
  } catch (error) {
    console.error('[DISPATCH] Error:', error);
    return res.status(500).json({ error: 'Erro ao disparar mensagens' });
  }
});

/**
 * GET /api/radar/dispatch-history
 * Returns dispatch log for the user
 */
router.get('/dispatch-history', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const logs = await prisma.dispatchLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json({ logs });
  } catch (error) {
    console.error('[DISPATCH] History error:', error);
    return res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

export default router;
