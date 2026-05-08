import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import { env } from '../config/env';
import { scraperQueue, redisConnection } from '../queues/scraper.queue';

const router = Router();
const prisma = new PrismaClient();

import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

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
    const { phone, content, contacts, message, dispatchMode = 'message', type = 'text', mediaUrl, funnelId } = req.body;

    // Normalize to batch format
    const contactList: { phone: string; name?: string; variables?: Record<string, string> }[] = contacts
      ? contacts
      : phone ? [{ phone, name: undefined }] : [];

    const msgContent = message || content;

    if (contactList.length === 0) {
      return res.status(400).json({ error: 'Contatos são obrigatórios' });
    }
    if (dispatchMode === 'message' && type === 'text' && !msgContent) {
      return res.status(400).json({ error: 'Mensagem de texto é obrigatória para este modo' });
    }
    if (dispatchMode === 'message' && type !== 'text' && !mediaUrl) {
      return res.status(400).json({ error: 'O upload do arquivo (Áudio/Documento) é obrigatório' });
    }
    if (dispatchMode === 'funnel' && !funnelId) {
      return res.status(400).json({ error: 'O ID do Funil é obrigatório para este modo' });
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

      let personalizedMsg = '';
      if (msgContent) {
        personalizedMsg = msgContent
          .replace(/\{\{nome\}\}/gi, contact.name || contact.variables?.nome || '')
          .replace(/\{\{telefone\}\}/gi, contact.phone || '')
          .replace(/\{\{negocio\}\}/gi, contact.variables?.negocio || contact.name || '');

        if (contact.variables) {
          Object.entries(contact.variables).forEach(([key, val]) => {
            personalizedMsg = personalizedMsg.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), val || '');
          });
        }
      }

      try {
        let response;
        if (dispatchMode === 'funnel') {
           response = await fetch(`${apiUrl}/api/v1/funnels/${funnelId}/add-lead`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'X-API-Key': user.komunikaApiKey },
             body: JSON.stringify({ phone: cleanPhone, name: contact.name, customFields: contact.variables || {} })
           });
           personalizedMsg = `[Injetado no Funil: ${funnelId}]`;
        } else {
           response = await fetch(`${apiUrl}/api/v1/messages/send`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', 'X-API-Key': user.komunikaApiKey },
             body: JSON.stringify({ instanceId: user.komunikaInstanceId, to: cleanPhone, type, mediaUrl, fileName: mediaUrl ? mediaUrl.split('/').pop() : undefined, ...(personalizedMsg ? { content: personalizedMsg } : {}) })
           });
        }

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

/**
 * POST /api/radar/upload-media
 * Uploads a file and returns its public URL to be used as mediaUrl
 */
router.post('/upload-media', authMiddleware, upload.single('file'), (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }
    const host = req.get('host') || 'api.czero.sbs';
    const protocol = req.protocol === 'https' || host.includes('sbs') ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;
    const mediaUrl = `${baseUrl}/uploads/${req.file.filename}`;
    return res.json({ url: mediaUrl });
  } catch (err: any) {
    console.error('[RADAR] Upload Error:', err);
    return res.status(500).json({ error: 'Erro ao fazer upload do ficheiro' });
  }
});

/**
 * POST /api/radar/export-crm
 * Exports a list of leads to Komunika CRM
 */
router.post('/export-crm', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { leads, tags } = req.body;
    
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'Nenhum lead fornecido para exportação' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.komunikaApiKey) {
      return res.status(400).json({ error: 'KOMUNIKA_NOT_CONFIGURED', message: 'API Key do Komunika não configurada.' });
    }

    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
    const results = { success: 0, failed: 0 };

    // Process leads in parallel batches of 10 to respect rate limits
    for (let i = 0; i < leads.length; i += 10) {
      const batch = leads.slice(i, i + 10);
      await Promise.all(batch.map(async (lead) => {
        try {
          const cleanPhone = (lead.phone || '').replace(/\D/g, '');
          if (!cleanPhone) { results.failed++; return; }
          
          const response = await fetch(`${apiUrl}/api/v1/contacts/capture`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': user.komunikaApiKey! },
            body: JSON.stringify({
              phone: cleanPhone,
              name: lead.name || 'Desconhecido',
              tags: tags || ['CodigoZero_Radar'],
              customFields: { status: lead.status || '', instagram: lead.instagram || '', source: 'Radar' }
            })
          });
          
          if (response.ok) results.success++;
          else results.failed++;
        } catch {
          results.failed++;
        }
      }));
    }

    return res.json({ success: true, successCount: results.success, failedCount: results.failed });
  } catch (error: any) {
    console.error('[RADAR] Export CRM error:', error);
    return res.status(500).json({ error: 'Erro interno ao exportar CRM' });
  }
});

/**
 * GET /api/radar/komunika-info
 * Returns Komunika instance status and active funnels
 */
router.get('/komunika-info', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user || !user.komunikaApiKey) {
      return res.json({ configured: false });
    }

    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
    
    let instanceStatus = null;
    if (user.komunikaInstanceId) {
       try {
         const stRes = await fetch(`${apiUrl}/api/v1/instances/${user.komunikaInstanceId}/status`, {
           headers: { 'X-API-Key': user.komunikaApiKey }
         });
         if (stRes.ok) {
           const stData = await stRes.json();
           instanceStatus = stData.data;
         }
       } catch {}
    }

    let funnels = [];
    try {
      const fnRes = await fetch(`${apiUrl}/api/v1/funnels`, {
        headers: { 'X-API-Key': user.komunikaApiKey }
      });
      if (fnRes.ok) {
        const fnData = await fnRes.json();
        funnels = fnData.data || [];
      }
    } catch {}

    return res.json({ configured: true, instanceStatus, funnels });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar info do Komunika' });
  }
});

export default router;
