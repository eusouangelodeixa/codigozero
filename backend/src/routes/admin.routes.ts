import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { sendPushBroadcast } from './auth.routes';
import { sendPushToSuperAdmins } from './auth.routes';

const router = Router();
const prisma = new PrismaClient();

// All admin routes require auth + admin role
router.use(authMiddleware);
router.use(adminMiddleware);

// ═══════════════════════════════════════
// DASHBOARD / STATS
// ═══════════════════════════════════════

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [totalUsers, activeUsers, leads, paidUsers, transactions, config] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { subscriptionStatus: 'active', role: 'member' } }),
      prisma.user.count({ where: { subscriptionStatus: 'lead' } }),
      prisma.user.count({ where: { subscriptionStatus: 'active', role: 'member', lojouOrderId: { not: null } } }),
      prisma.transaction.findMany({ where: { status: 'approved' }, select: { amount: true } }),
      prisma.systemConfig.findFirst({ where: { id: 'singleton' } }),
    ]);

    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    const mrr = paidUsers * 797;
    const vagasRestantes = "Ilimitado";

    const totalScripts = await prisma.script.count();
    const totalModules = await prisma.module.count();
    const totalLessons = await prisma.lesson.count();

    res.json({
      totalUsers,
      activeUsers,
      leads,
      paidUsers,
      totalRevenue,
      mrr,
      vagasRestantes,
      totalScripts,
      totalModules,
      totalLessons,
    });
  } catch (error) {
    console.error('[ADMIN] Stats error:', error);
    res.status(500).json({ error: 'Erro ao carregar estatísticas' });
  }
});

// ═══════════════════════════════════════
// LEADS (from landing page)
// ═══════════════════════════════════════

router.get('/leads', async (req: AuthRequest, res: Response) => {
  try {
    const filter = req.query.filter as string; // all, paid, unpaid
    const search = req.query.search as string;

    let where: any = {};

    if (filter === 'paid') {
      where.subscriptionStatus = 'active';
      where.lojouOrderId = { not: null };
    } else if (filter === 'unpaid') {
      where.subscriptionStatus = 'lead';
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const leads = await prisma.user.findMany({
      where: { ...where, role: 'member' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, phone: true,
        subscriptionStatus: true, lojouOrderId: true, createdAt: true,
      },
    });

    res.json({ leads, total: leads.length });
  } catch (error) {
    console.error('[ADMIN] Leads error:', error);
    res.status(500).json({ error: 'Erro ao carregar leads' });
  }
});

// ═══════════════════════════════════════
// FINANCE
// ═══════════════════════════════════════

router.get('/finance', async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '30d'; // 7d, 30d, 12m
    const now = new Date();
    let startDate = new Date();
    let previousStartDate = new Date();

    if (period === '7d') {
      startDate.setDate(now.getDate() - 7);
      previousStartDate.setDate(startDate.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(now.getDate() - 30);
      previousStartDate.setDate(startDate.getDate() - 30);
    } else if (period === '12m') {
      startDate.setMonth(now.getMonth() - 12);
      previousStartDate.setMonth(startDate.getMonth() - 12);
    }

    // Current period transactions
    const currentTransactions = await prisma.transaction.findMany({
      where: {
        status: 'approved',
        createdAt: { gte: startDate, lte: now }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Previous period transactions (for comparison)
    const previousTransactions = await prisma.transaction.findMany({
      where: {
        status: 'approved',
        createdAt: { gte: previousStartDate, lt: startDate }
      }
    });

    // Metrics
    const currentRevenue = currentTransactions.reduce((sum, t) => sum + t.amount, 0);
    const previousRevenue = previousTransactions.reduce((sum, t) => sum + t.amount, 0);
    const revenueGrowth = previousRevenue === 0 
      ? (currentRevenue > 0 ? 100 : 0) 
      : ((currentRevenue - previousRevenue) / previousRevenue) * 100;

    const currentTicket = currentTransactions.length > 0 ? currentRevenue / currentTransactions.length : 0;
    const previousTicket = previousTransactions.length > 0 ? previousRevenue / previousTransactions.length : 0;
    const ticketGrowth = previousTicket === 0
      ? (currentTicket > 0 ? 100 : 0)
      : ((currentTicket - previousTicket) / previousTicket) * 100;

    const currentCount = currentTransactions.length;
    const previousCount = previousTransactions.length;
    const countGrowth = previousCount === 0
      ? (currentCount > 0 ? 100 : 0)
      : ((currentCount - previousCount) / previousCount) * 100;

    // Chart Data Generation
    const chartDataMap = new Map<string, number>();
    
    if (period === '12m') {
      // Group by month
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        chartDataMap.set(d.toLocaleString('pt-MZ', { month: 'short', year: '2-digit' }), 0);
      }
      currentTransactions.forEach(t => {
        const key = new Date(t.createdAt).toLocaleString('pt-MZ', { month: 'short', year: '2-digit' });
        if (chartDataMap.has(key)) chartDataMap.set(key, chartDataMap.get(key)! + t.amount);
      });
    } else {
      // Group by day
      const days = period === '7d' ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit' });
        chartDataMap.set(key, 0);
      }
      currentTransactions.forEach(t => {
        const key = new Date(t.createdAt).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit' });
        if (chartDataMap.has(key)) chartDataMap.set(key, chartDataMap.get(key)! + t.amount);
      });
    }

    const chartData = Array.from(chartDataMap.entries()).map(([date, amount]) => ({ date, amount }));

    // Recent Transactions (top 20 overall, not limited to period)
    const recentList = await prisma.transaction.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        userName: true,
        userEmail: true,
        amount: true,
        status: true,
        createdAt: true,
        paymentMethod: true
      }
    });

    res.json({
      metrics: {
        revenue: currentRevenue,
        revenueGrowth,
        ticket: currentTicket,
        ticketGrowth,
        count: currentCount,
        countGrowth
      },
      chartData,
      recentTransactions: recentList
    });
  } catch (error) {
    console.error('[ADMIN] Finance error:', error);
    res.status(500).json({ error: 'Erro ao carregar dados financeiros' });
  }
});

// ═══════════════════════════════════════
// USERS
// ═══════════════════════════════════════

router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = 20;

    let where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true, name: true, email: true, phone: true, role: true,
          isActive: true, subscriptionStatus: true, subscriptionEnd: true,
          lojouOrderId: true, dailySearchCount: true, createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total, page, perPage, lastPage: Math.ceil(total / perPage) });
  } catch (error) {
    console.error('[ADMIN] Users error:', error);
    res.status(500).json({ error: 'Erro ao carregar usuários' });
  }
});

router.get('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { leads: { take: 10, orderBy: { createdAt: 'desc' } }, lessonProgress: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar usuário' });
  }
});

router.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, role, isActive, subscriptionStatus, subscriptionEnd, password } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (subscriptionStatus !== undefined) data.subscriptionStatus = subscriptionStatus;
    if (subscriptionEnd !== undefined) data.subscriptionEnd = subscriptionEnd ? new Date(subscriptionEnd) : null;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({ where: { id: req.params.id }, data });
    res.json({ user });
  } catch (error) {
    console.error('[ADMIN] Update user error:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover usuário' });
  }
});

// ═══════════════════════════════════════
// SCRIPTS (CRUD)
// ═══════════════════════════════════════

router.get('/script-folders', async (_req: AuthRequest, res: Response) => {
  try {
    const folders = await prisma.scriptFolder.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { scripts: { orderBy: { sortOrder: 'asc' } } }
    });
    res.json({ folders });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar pastas de scripts' });
  }
});

router.post('/script-folders', async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon, sortOrder } = req.body;
    const folder = await prisma.scriptFolder.create({
      data: { name, icon, sortOrder: sortOrder || 0 },
    });
    res.json({ folder });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar pasta de scripts' });
  }
});

router.patch('/script-folders/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, icon, sortOrder } = req.body;
    const folder = await prisma.scriptFolder.update({
      where: { id: req.params.id },
      data: { name, icon, sortOrder },
    });
    res.json({ folder });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar pasta de scripts' });
  }
});

router.delete('/script-folders/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.scriptFolder.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover pasta de scripts' });
  }
});

router.get('/scripts', async (_req: AuthRequest, res: Response) => {
  try {
    const scripts = await prisma.script.findMany({ orderBy: [{ folderId: 'asc' }, { sortOrder: 'asc' }] });
    res.json({ scripts });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar scripts' });
  }
});

router.post('/scripts', async (req: AuthRequest, res: Response) => {
  try {
    const { title, folderId, content, icon, sortOrder } = req.body;
    const script = await prisma.script.create({
      data: { title, folderId, content, icon, sortOrder: sortOrder || 0 },
    });
    res.json({ script });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar script' });
  }
});

router.patch('/scripts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, folderId, content, icon, sortOrder } = req.body;
    const script = await prisma.script.update({
      where: { id: req.params.id },
      data: { title, folderId, content, icon, sortOrder },
    });
    res.json({ script });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar script' });
  }
});

router.delete('/scripts/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.script.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover script' });
  }
});

// ═══════════════════════════════════════
// MODULES (CRUD)
// ═══════════════════════════════════════

router.get('/modules', async (_req: AuthRequest, res: Response) => {
  try {
    const modules = await prisma.module.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { lessons: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json({ modules });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar módulos' });
  }
});

router.post('/modules', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, icon, sortOrder } = req.body;
    const mod = await prisma.module.create({
      data: { title, description, icon, sortOrder: sortOrder || 0 },
    });
    res.json({ module: mod });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar módulo' });
  }
});

router.patch('/modules/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, icon, sortOrder } = req.body;
    const mod = await prisma.module.update({
      where: { id: req.params.id },
      data: { title, description, icon, sortOrder },
    });
    res.json({ module: mod });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar módulo' });
  }
});

router.delete('/modules/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.module.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover módulo' });
  }
});

// ═══════════════════════════════════════
// LESSONS (CRUD)
// ═══════════════════════════════════════

router.post('/lessons', async (req: AuthRequest, res: Response) => {
  try {
    const { moduleId, title, description, videoUrl, duration, sortOrder, tools, content, materials } = req.body;
    const lesson = await prisma.lesson.create({
      data: { moduleId, title, description, videoUrl, duration, sortOrder: sortOrder || 0, tools, content, materials },
    });

    // 🔔 Push to all students: new lesson
    const mod = await prisma.module.findUnique({ where: { id: moduleId }, select: { title: true } });
    sendPushBroadcast({
      title: '🎓 Nova Aula Disponível!',
      body: `${title}${mod ? ` — ${mod.title}` : ''}`,
      url: '/forja',
    }).catch(() => {});

    res.json({ lesson });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar aula' });
  }
});

router.patch('/lessons/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, videoUrl, duration, sortOrder, tools, content, materials } = req.body;
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data: { title, description, videoUrl, duration, sortOrder, tools, content, materials },
    });
    res.json({ lesson });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar aula' });
  }
});

router.delete('/lessons/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.lesson.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover aula' });
  }
});

// ═══════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════

router.get('/transactions', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string;
    const page = parseInt(req.query.page as string) || 1;
    const perPage = 20;

    const where: any = {};
    if (status) where.status = status;

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, page, perPage });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar transações' });
  }
});

// ═══════════════════════════════════════
// LANDING PAGE CONFIG
// ═══════════════════════════════════════

router.get('/landing-config', async (_req: AuthRequest, res: Response) => {
  try {
    let config = await prisma.landingConfig.findFirst({ where: { id: 'singleton' } });
    if (!config) {
      config = await prisma.landingConfig.create({ data: { id: 'singleton' } });
    }
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar config da landing' });
  }
});

router.patch('/landing-config', async (req: AuthRequest, res: Response) => {
  try {
    const { vslEmbedUrl, vslEmbedHtml, heroTitle, heroSubtitle, heroDesc, ctaText, priceAmount, maxVagas, sections, headScripts, bodyScripts } = req.body;
    const config = await prisma.landingConfig.upsert({
      where: { id: 'singleton' },
      update: { vslEmbedUrl, vslEmbedHtml, heroTitle, heroSubtitle, heroDesc, ctaText, priceAmount, maxVagas, sections, headScripts, bodyScripts },
      create: { id: 'singleton', vslEmbedUrl, vslEmbedHtml, heroTitle, heroSubtitle, heroDesc, ctaText, priceAmount, maxVagas, sections, headScripts, bodyScripts },
    });
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar config da landing' });
  }
});

// ═══════════════════════════════════════
// SYSTEM CONFIG
// ═══════════════════════════════════════

router.get('/system', async (_req: AuthRequest, res: Response) => {
  try {
    let config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    if (!config) {
      config = await prisma.systemConfig.create({ data: { id: 'singleton' } });
    }

    // Tentar carregar a lista de funis do Komunika se a API KEY estiver configurada
    let funnels = [];
    const apiKeyToUse = config?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
    if (apiKeyToUse) {
      try {
        const response = await fetch(`${process.env.KOMUNIKA_API_URL || 'https://api.komunika.site'}/api/v1/funnels`, {
          headers: { 'X-API-Key': apiKeyToUse }
        });
        const data = await response.json().catch(() => null);
        if (data && data.success && Array.isArray(data.data)) {
          funnels = data.data;
        }
      } catch (e) {
        console.error('[ADMIN] Erro ao carregar funis do Komunika:', e);
      }
    }

    res.json({ config, funnels });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar config do sistema' });
  }
});

router.patch('/system', async (req: AuthRequest, res: Response) => {
  try {
    const { maxUsers, communityLink, mentoriaSchedule, mentoriaLink, komunikaVisitorFunnelId, komunikaCheckoutFunnelId, komunikaAdminApiKey, komunikaInstanceId, milestoneAlertPhone, milestoneAlertName } = req.body;
    const config = await prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: { maxUsers, communityLink, mentoriaSchedule, mentoriaLink, komunikaVisitorFunnelId, komunikaCheckoutFunnelId, komunikaAdminApiKey, komunikaInstanceId, milestoneAlertPhone, milestoneAlertName },
      create: { id: 'singleton', maxUsers, communityLink, mentoriaSchedule, mentoriaLink, komunikaVisitorFunnelId, komunikaCheckoutFunnelId, komunikaAdminApiKey, komunikaInstanceId, milestoneAlertPhone, milestoneAlertName },
    });
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar config do sistema' });
  }
});

router.post('/komunika-test', async (req: AuthRequest, res: Response) => {
  try {
    const { phone, type } = req.body;
    if (!phone || !type) return res.status(400).json({ error: 'Telefone e tipo de teste são obrigatórios' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
      cleanPhone = `258${cleanPhone}`;
    }

    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const apiKey = config?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Chave da API do Komunika não configurada' });

    const funnelId = type === 'visitor' ? (config?.komunikaVisitorFunnelId || process.env.KOMUNIKA_FUNNEL_VISITOR_ID) : (config?.komunikaCheckoutFunnelId || process.env.KOMUNIKA_FUNNEL_CHECKOUT_ID);
    
    if (!funnelId) {
      return res.status(400).json({ error: `Funil de ${type === 'visitor' ? 'Visitantes' : 'Recuperação'} não selecionado nas configurações.` });
    }

    const payload = {
      phone: cleanPhone,
      name: "Teste Admin",
      email: "teste@codigozero.com",
      customFields: {
        origem: "Disparo de Teste (Admin)",
        checkout_url: "https://pay.lojou.app/token/49_Oqg8fBHum",
        goal: "Ter uma renda extra de 10.000 a 20.000 MT mensais.",
        pain: "Não sei programar e acho tecnologia muito complexo.",
        commitment: "1 a 2 horas por dia.",
        awareness: "Sim, mas não sei por onde começar."
      }
    };

    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
    
    const response = await fetch(`${apiUrl}/api/v1/funnels/${funnelId}/add-lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: `Komunika retornou erro: ${errBody}` });
    }

    const responseData = await response.json();
    res.json({ success: true, message: 'Teste disparado com sucesso!', data: responseData });

  } catch (error: any) {
    console.error('[ADMIN] Erro no teste do Komunika:', error);
    res.status(500).json({ error: `Falha ao ligar ao Komunika: ${error.message}` });
  }
});

// ═══════════════════════════════════════
// BROADCAST — Mass WhatsApp Dispatch
// ═══════════════════════════════════════

/**
 * GET /api/admin/broadcast/audience
 * Returns audience segment counts + available personalization variables
 */
router.get('/broadcast/audience', async (_req: AuthRequest, res: Response) => {
  try {
    const [active, inactive, visitors, total] = await Promise.all([
      prisma.user.count({ where: { subscriptionStatus: 'active', role: 'member' } }),
      prisma.user.count({ where: { subscriptionStatus: { in: ['overdue', 'canceled', 'grace_period'] } } }),
      prisma.user.count({ where: { subscriptionStatus: 'lead' } }),
      prisma.user.count(),
    ]);

    res.json({
      segments: { active, inactive, visitors, total },
      variables: [
        { key: '{{nome}}', label: 'Nome', field: 'name' },
        { key: '{{email}}', label: 'E-mail', field: 'email' },
        { key: '{{telefone}}', label: 'Telefone', field: 'phone' },
        { key: '{{objetivo}}', label: 'Objetivo (Quiz)', field: 'surveyAnswers.goal' },
        { key: '{{dor}}', label: 'Dor (Quiz)', field: 'surveyAnswers.pain' },
        { key: '{{compromisso}}', label: 'Compromisso (Quiz)', field: 'surveyAnswers.commitment' },
        { key: '{{consciencia}}', label: 'Consciência (Quiz)', field: 'surveyAnswers.awareness' },
      ],
    });
  } catch (error) {
    console.error('[BROADCAST] Audience error:', error);
    res.status(500).json({ error: 'Erro ao carregar audiência' });
  }
});

/**
 * GET /api/admin/broadcast/instances
 * Lists available Komunika WhatsApp instances
 */
router.get('/broadcast/instances', async (_req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const apiKey = config?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

    if (!apiKey) {
      return res.json({ instances: [], error: 'Chave da API do Komunika não configurada' });
    }

    const response = await fetch(`${apiUrl}/api/v1/instances`, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!response.ok) {
      return res.json({ instances: [], error: `Komunika retornou ${response.status}` });
    }

    const data = await response.json().catch(() => null);
    const instances = data?.data || data?.instances || (Array.isArray(data) ? data : []);

    res.json({ instances });
  } catch (error: any) {
    console.error('[BROADCAST] Instances error:', error);
    res.json({ instances: [], error: error.message });
  }
});

/**
 * POST /api/admin/broadcast/preview
 * Returns preview of message with variables substituted for a sample lead
 */
router.post('/broadcast/preview', async (req: AuthRequest, res: Response) => {
  try {
    const { segment, message } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });

    const where = buildSegmentWhere(segment);
    const sampleUser = await prisma.user.findFirst({ where, orderBy: { createdAt: 'desc' } });

    if (!sampleUser) {
      return res.json({ preview: message, sample: null, message: 'Nenhum lead encontrado neste segmento.' });
    }

    const preview = substituteVariables(message, sampleUser);

    res.json({
      preview,
      sample: {
        name: sampleUser.name,
        email: sampleUser.email,
        phone: sampleUser.phone,
      },
    });
  } catch (error) {
    console.error('[BROADCAST] Preview error:', error);
    res.status(500).json({ error: 'Erro ao gerar preview' });
  }
});

/**
 * POST /api/admin/broadcast/send
 * Dispatches messages with randomized delays via SSE
 */
router.post('/broadcast/send', async (req: AuthRequest, res: Response) => {
  try {
    const { segment, message, instanceId, delayMin, delayMax, sendPush, generateCoupons, couponDiscount, couponMaxUses } = req.body;

    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });
    if (!instanceId && !sendPush) return res.status(400).json({ error: 'Selecione uma instância WhatsApp ou ative Push Notification' });

    const sendWhatsApp = !!instanceId;
    const minDelay = Math.max(1, parseInt(delayMin) || 5);
    const maxDelay = Math.max(minDelay, parseInt(delayMax) || 15);

    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const apiKey = config?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

    // Only require API key if actually sending via WhatsApp
    if (sendWhatsApp && !apiKey) return res.status(400).json({ error: 'Chave da API do Komunika não configurada' });

    const where = buildSegmentWhere(segment);
    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, surveyAnswers: true },
    });

    if (users.length === 0) return res.status(400).json({ error: 'Nenhum lead encontrado neste segmento' });

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (data: object) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    sendEvent({ type: 'start', total: users.length });

    let sent = 0;
    let failed = 0;

    if (sendWhatsApp) {
      // ── WhatsApp broadcast loop ──
      for (let i = 0; i < users.length; i++) {
        const user = users[i];

        // Clean phone
        let cleanPhone = user.phone.replace(/\D/g, '');
        if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
          cleanPhone = `258${cleanPhone}`;
        }

        // Skip if no valid phone
        if (cleanPhone.length < 9) {
          failed++;
          sendEvent({ type: 'skip', index: i, name: user.name, reason: 'Telefone inválido', sent, failed });
          continue;
        }

        let personalizedMsg = substituteVariables(message, user);

        // Generate per-user coupon if enabled
        if (generateCoupons && message.includes('{{cupom}}')) {
          const couponCode = `CZ${couponDiscount || 10}_${user.id.slice(0, 6).toUpperCase()}`;
          try {
            const lojouApi = `${process.env.LOJOU_API_URL || 'https://api.lojou.app'}/v1`;
            const lojouKey = process.env.LOJOU_API_KEY;
            if (lojouKey) {
              const discRes = await fetch(`${lojouApi}/discounts`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${lojouKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: couponCode,
                  type: 'percentage',
                  value: parseInt(couponDiscount) || 10,
                  uses_limit: parseInt(couponMaxUses) || 1,
                  active: true,
                }),
              });
              if (discRes.ok) {
                console.log(`[BROADCAST] 🎟️ Coupon ${couponCode} created for ${user.email}`);
              } else {
                console.warn(`[BROADCAST] Coupon creation failed for ${user.email}: ${discRes.status}`);
              }
            }
          } catch (couponErr) {
            console.warn(`[BROADCAST] Coupon error for ${user.email}:`, couponErr);
          }
          personalizedMsg = personalizedMsg.replace(/\{\{cupom\}\}/gi, couponCode);
        }

        try {
          const sendRes = await fetch(`${apiUrl}/api/v1/messages/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey!,
            },
            body: JSON.stringify({
              instanceId,
              to: cleanPhone,
              type: 'text',
              content: personalizedMsg,
            }),
          });

          if (sendRes.ok) {
            sent++;
            sendEvent({ type: 'sent', index: i, name: user.name, phone: cleanPhone, sent, failed });
          } else {
            const errBody = await sendRes.text().catch(() => 'Unknown error');
            failed++;
            sendEvent({ type: 'error', index: i, name: user.name, error: errBody, sent, failed });
          }
        } catch (err: any) {
          failed++;
          sendEvent({ type: 'error', index: i, name: user.name, error: err.message, sent, failed });
        }

        // Randomized delay between messages (anti-block)
        if (i < users.length - 1) {
          const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          sendEvent({ type: 'waiting', delay, nextIndex: i + 1, sent, failed });
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }
    } else {
      // ── Push-only mode: no WhatsApp loop ──
      sent = users.length;
    }

    sendEvent({ type: 'complete', sent, failed, total: users.length });
    res.end();

    // Send Web Push notification if requested
    if (sendPush) {
      // Strip {{variable}} placeholders since push is broadcast (not per-user)
      const pushBody = message
        .replace(/\{\{nome\}\}/gi, 'Aluno')
        .replace(/\{\{email\}\}/gi, '')
        .replace(/\{\{telefone\}\}/gi, '')
        .replace(/\{\{objetivo\}\}/gi, '')
        .replace(/\{\{dor\}\}/gi, '')
        .replace(/\{\{compromisso\}\}/gi, '')
        .replace(/\{\{consciencia\}\}/gi, '')
        .replace(/\{\{cupom\}\}/gi, '')
        .replace(/\{\{[^}]+\}\}/g, '')  // catch any remaining
        .replace(/\s{2,}/g, ' ')        // collapse double spaces
        .trim();
      sendPushBroadcast({
        title: 'Código Zero',
        body: pushBody.length > 120 ? pushBody.substring(0, 120) + '...' : pushBody,
        url: '/dashboard',
      }).catch(() => {});
    }

  } catch (error: any) {
    console.error('[BROADCAST] Send error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: `Erro ao enviar broadcast: ${error.message}` });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'fatal', error: error.message })}\n\n`);
      res.end();
    }
  }
});

// ── Broadcast helpers ──

function buildSegmentWhere(segment: string): any {
  switch (segment) {
    case 'active':
      return { subscriptionStatus: 'active', role: 'member' };
    case 'inactive':
      return { subscriptionStatus: { in: ['overdue', 'canceled', 'grace_period'] } };
    case 'visitors':
      return { subscriptionStatus: 'lead' };
    case 'all':
    default:
      return {};
  }
}

function substituteVariables(message: string, user: any): string {
  const survey = (typeof user.surveyAnswers === 'object' && user.surveyAnswers) || {};
  return message
    .replace(/\{\{nome\}\}/gi, user.name || '')
    .replace(/\{\{email\}\}/gi, user.email || '')
    .replace(/\{\{telefone\}\}/gi, user.phone || '')
    .replace(/\{\{objetivo\}\}/gi, survey.goal || '')
    .replace(/\{\{dor\}\}/gi, survey.pain || '')
    .replace(/\{\{compromisso\}\}/gi, survey.commitment || '')
    .replace(/\{\{consciencia\}\}/gi, survey.awareness || '');
}


// ═══════════════════════════════════════
// LOJOU AUDIT ENDPOINTS
// ═══════════════════════════════════════

const LOJOU_API = `${process.env.LOJOU_API_URL || 'https://api.lojou.app'}/v1`;
const LOJOU_KEY = process.env.LOJOU_API_KEY;
const KOMUNIKA_URL = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

/**
 * Send a WhatsApp message via Komunika API
 */
async function sendKomunika(phone: string, message: string): Promise<boolean> {
  const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const apiKey = config?.komunikaAdminApiKey;
  const instanceId = config?.komunikaInstanceId;
  if (!apiKey || !instanceId) { console.warn('[KOMUNIKA] Not configured (missing apiKey or instanceId)'); return false; }

  let cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) cleanPhone = `258${cleanPhone}`;

  try {
    const res = await fetch(`${KOMUNIKA_URL}/api/v1/messages/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ instanceId, to: cleanPhone, type: 'text', content: message }),
    });
    if (res.ok) { console.log(`[KOMUNIKA] Message sent to ${cleanPhone}`); return true; }
    console.warn(`[KOMUNIKA] Send failed: ${res.status} ${await res.text().catch(() => '')}`);
    return false;
  } catch (e) { console.error('[KOMUNIKA] Error:', e); return false; }
}

/**
 * GET /api/admin/lojou/customer-orders?email=xxx
 * Fetch a customer's orders directly from Lojou
 */
router.get('/lojou/customer-orders', async (req: AuthRequest, res: Response) => {
  try {
    const email = req.query.email as string;
    if (!email || !LOJOU_KEY) return res.json({ orders: [] });

    // Find customer at Lojou
    const custRes = await fetch(`${LOJOU_API}/customers/${encodeURIComponent(email)}`, {
      headers: { 'Authorization': `Bearer ${LOJOU_KEY}` },
    });

    if (!custRes.ok) return res.json({ orders: [], error: 'Customer not found at Lojou' });
    const customer = await custRes.json();
    const customerId = customer.data?.id || customer.id;

    if (!customerId) return res.json({ orders: [] });

    // Fetch their orders
    const ordersRes = await fetch(`${LOJOU_API}/customers/${customerId}/orders?per_page=50`, {
      headers: { 'Authorization': `Bearer ${LOJOU_KEY}` },
    });

    const ordersData = await ordersRes.json();
    return res.json({ orders: ordersData.data || ordersData.orders || [], customer });
  } catch (error) {
    console.error('[ADMIN] Lojou customer orders error:', error);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

/**
 * GET /api/admin/lojou/stats
 * Fetch store stats from Lojou
 */
router.get('/lojou/stats', async (_req: AuthRequest, res: Response) => {
  try {
    if (!LOJOU_KEY) return res.json({ stats: null });

    const statsRes = await fetch(`${LOJOU_API}/user/stats`, {
      headers: { 'Authorization': `Bearer ${LOJOU_KEY}` },
    });

    if (!statsRes.ok) return res.json({ stats: null, error: `Lojou: ${statsRes.status}` });
    const stats = await statsRes.json();
    return res.json({ stats: stats.data || stats });
  } catch (error) {
    console.error('[ADMIN] Lojou stats error:', error);
    return res.status(500).json({ error: 'Erro ao buscar estatísticas' });
  }
});

/**
 * GET /api/admin/lojou/conciliation
 * On-demand conciliation: compare Lojou approved orders vs local transactions
 */
router.get('/lojou/conciliation', async (_req: AuthRequest, res: Response) => {
  try {
    if (!LOJOU_KEY) return res.json({ results: [], error: 'API key not configured' });

    const ordersRes = await fetch(`${LOJOU_API}/orders?status=approved&per_page=100`, {
      headers: { 'Authorization': `Bearer ${LOJOU_KEY}` },
    });

    if (!ordersRes.ok) return res.json({ results: [], error: `Lojou: ${ordersRes.status}` });
    const data = await ordersRes.json();
    const lojouOrders = data.data || data.orders || [];

    const results: any[] = [];

    for (const order of lojouOrders) {
      const orderId = String(order.id || order.order_number);
      const localTx = await prisma.transaction.findUnique({ where: { orderId } });

      if (!localTx) {
        results.push({ orderId, email: order.customer?.email, status: 'MISSING_LOCAL', lojouStatus: 'approved' });
      } else if (localTx.status !== 'approved') {
        results.push({ orderId, email: order.customer?.email, status: 'MISMATCH', localStatus: localTx.status, lojouStatus: 'approved' });
      }
    }

    return res.json({ results, totalChecked: lojouOrders.length, issues: results.length });
  } catch (error) {
    console.error('[ADMIN] Conciliation error:', error);
    return res.status(500).json({ error: 'Erro na conciliação' });
  }
});

/**
 * GET /api/admin/lojou/plan-subscribers
 * List active subscribers of the plan from Lojou
 */
router.get('/lojou/plan-subscribers', async (_req: AuthRequest, res: Response) => {
  try {
    if (!LOJOU_KEY) return res.json({ subscribers: [] });

    const planId = process.env.LOJOU_PLAN_ID || 'tbo8f';
    const subRes = await fetch(`${LOJOU_API}/plans/${planId}/subscribers?per_page=100`, {
      headers: { 'Authorization': `Bearer ${LOJOU_KEY}` },
    });

    if (!subRes.ok) return res.json({ subscribers: [], error: `Lojou: ${subRes.status}` });
    const data = await subRes.json();
    return res.json({ subscribers: data.data || data.subscribers || [] });
  } catch (error) {
    console.error('[ADMIN] Plan subscribers error:', error);
    return res.status(500).json({ error: 'Erro ao buscar assinantes' });
  }
});

// ═══════════════════════════════════════
// PLATFORM STATUS & MILESTONES
// ═══════════════════════════════════════

const DEFAULT_MILESTONES = {
  revenue: [1000, 10000, 50000, 100000, 500000, 1000000],
  subscribers: [1, 15, 65, 125, 625, 797, 1250],
};

async function seedMilestones() {
  for (const [cat, values] of Object.entries(DEFAULT_MILESTONES)) {
    for (const val of values) {
      await prisma.platformMilestone.upsert({
        where: { category_targetValue: { category: cat, targetValue: val } },
        create: { category: cat, targetValue: val },
        update: {},
      });
    }
  }
}

async function getPlatformMetrics() {
  const approvedTx = await prisma.transaction.findMany({ where: { status: 'approved' } });
  const totalRevenue = approvedTx.reduce((s, t) => s + t.amount, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthRevenue = approvedTx.filter(t => t.createdAt >= monthStart).reduce((s, t) => s + t.amount, 0);

  const uniquePayers = new Set(approvedTx.map(t => t.userEmail).filter(Boolean));
  const totalSubscribers = uniquePayers.size;

  const activeUsers = await prisma.user.count({ where: { subscriptionStatus: 'active' } });

  return { totalRevenue, monthRevenue, totalSubscribers, activeUsers };
}

async function detectAnomalies() {
  const anomalies: { type: string; message: string }[] = [];
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const failedTx = await prisma.transaction.count({ where: { status: 'failed', createdAt: { gte: h24 } } });
  if (failedTx > 0) anomalies.push({ type: 'warning', message: `${failedTx} transação(ões) falhada(s) nas últimas 24h` });

  const canceledToday = await prisma.user.count({ where: { subscriptionStatus: 'canceled', updatedAt: { gte: h24 } } });
  if (canceledToday > 2) anomalies.push({ type: 'critical', message: `${canceledToday} cancelamentos nas últimas 24h — acima do normal` });

  const lastTx = await prisma.transaction.findFirst({ orderBy: { createdAt: 'desc' } });
  if (lastTx && lastTx.createdAt < h48) anomalies.push({ type: 'info', message: 'Nenhuma transação nas últimas 48h' });

  const graceUsers = await prisma.user.count({ where: { subscriptionStatus: 'grace_period', updatedAt: { lt: h48 } } });
  if (graceUsers > 0) anomalies.push({ type: 'warning', message: `${graceUsers} usuário(s) em grace_period há mais de 48h` });

  const allCoupons = await prisma.coupon.findMany({ where: { active: true } });
  const exhausted = allCoupons.filter(c => c.usesCount >= c.maxUses).length;
  if (exhausted > 0) anomalies.push({ type: 'info', message: `${exhausted} cupom(ns) com uso esgotado mas ainda ativo(s)` });

  return anomalies;
}

async function checkAndNotifyMilestones() {
  const metrics = await getPlatformMetrics();
  const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });

  const unreached = await prisma.platformMilestone.findMany({ where: { reached: false } });
  const newlyReached: any[] = [];

  for (const m of unreached) {
    const current = m.category === 'revenue' ? metrics.totalRevenue : metrics.totalSubscribers;
    if (current >= m.targetValue) {
      await prisma.platformMilestone.update({ where: { id: m.id }, data: { reached: true, reachedAt: new Date() } });
      newlyReached.push(m);
    }
  }

  if (newlyReached.length > 0 && config?.milestoneAlertPhone) {
    // Get daily stats
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayTx = await prisma.transaction.findMany({ where: { status: 'approved', createdAt: { gte: todayStart } } });
    const todaySales = todayTx.length;
    const todayRevenue = todayTx.reduce((s, t) => s + t.amount, 0);
    const totalUsers = await prisma.user.count();
    const activeUsers = metrics.activeUsers;

    const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

    for (const m of newlyReached) {
      const label = m.category === 'revenue'
        ? `${fmt(m.targetValue)} MT em faturamento`
        : `${m.targetValue} assinante(s)`;

      const msg = [
        `*Código Zero — Meta Alcançada* 🏆`,
        ``,
        `Parabéns ${config.milestoneAlertName || 'Admin'}!`,
        ``,
        `A meta de *${label}* foi atingida!`,
        ``,
        `━━━━━━━━━━━━━━━━━━`,
        `📊 *Resumo da Plataforma*`,
        ``,
        `👥 Total de usuários: *${fmt(totalUsers)}*`,
        `✅ Usuários ativos: *${fmt(activeUsers)}*`,
        `💰 Faturamento total: *${fmt(metrics.totalRevenue)} MT*`,
        `📅 Faturamento este mês: *${fmt(metrics.monthRevenue)} MT*`,
        `🛒 Vendas hoje: *${todaySales}* (${fmt(todayRevenue)} MT)`,
        `🎯 Assinantes (pagaram): *${fmt(metrics.totalSubscribers)}*`,
        `━━━━━━━━━━━━━━━━━━`,
        ``,
        `Continue acompanhando em /admin/status`,
      ].join('\n');

      await sendKomunika(config.milestoneAlertPhone, msg);
      await prisma.platformMilestone.update({ where: { id: m.id }, data: { notified: true } });
      console.log(`[MILESTONE] Notified: ${m.category} ${m.targetValue}`);
    }
  }

  return newlyReached;
}

router.get('/platform-status', async (_req: AuthRequest, res: Response) => {
  try {
    await seedMilestones();
    const metrics = await getPlatformMetrics();
    const milestones = await prisma.platformMilestone.findMany({ orderBy: [{ category: 'asc' }, { targetValue: 'asc' }] });
    const anomalies = await detectAnomalies();
    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });

    return res.json({
      revenue: { total: metrics.totalRevenue, thisMonth: metrics.monthRevenue },
      subscribers: { total: metrics.totalSubscribers, active: metrics.activeUsers },
      milestones,
      anomalies,
      config: { alertPhone: config?.milestoneAlertPhone || '', alertName: config?.milestoneAlertName || '' },
    });
  } catch (error) {
    console.error('[ADMIN] Platform status error:', error);
    return res.status(500).json({ error: 'Erro ao carregar status' });
  }
});

router.patch('/platform-config', async (req: AuthRequest, res: Response) => {
  try {
    const { alertPhone, alertName, newMilestone } = req.body;

    if (alertPhone !== undefined || alertName !== undefined) {
      const data: any = {};
      if (alertPhone !== undefined) data.milestoneAlertPhone = alertPhone;
      if (alertName !== undefined) data.milestoneAlertName = alertName;
      await prisma.systemConfig.upsert({ where: { id: 'singleton' }, create: { id: 'singleton', ...data }, update: data });
    }

    if (newMilestone) {
      const { category, targetValue } = newMilestone;
      if (category && targetValue > 0) {
        await prisma.platformMilestone.upsert({
          where: { category_targetValue: { category, targetValue: parseFloat(targetValue) } },
          create: { category, targetValue: parseFloat(targetValue) },
          update: {},
        });
      }
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('[ADMIN] Platform config error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar configuração' });
  }
});

router.delete('/platform-milestone/:id', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.platformMilestone.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Erro ao excluir meta' }); }
});

router.post('/platform-check-milestones', async (_req: AuthRequest, res: Response) => {
  try {
    const reached = await checkAndNotifyMilestones();
    return res.json({ success: true, newlyReached: reached.length, milestones: reached });
  } catch (error) {
    console.error('[ADMIN] Check milestones error:', error);
    return res.status(500).json({ error: 'Erro ao verificar metas' });
  }
});

// ═══════════════════════════════════════
// COUPON MANAGEMENT (Local DB + Lojou Sync)
// ═══════════════════════════════════════

router.get('/cupons', async (_req: AuthRequest, res: Response) => {
  try {
    const coupons = await prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ coupons });
  } catch (error) {
    console.error('[ADMIN] List coupons error:', error);
    return res.status(500).json({ error: 'Erro ao listar cupons' });
  }
});

router.post('/cupons', async (req: AuthRequest, res: Response) => {
  try {
    const { code, type, value, max_uses, active, linkedUserId } = req.body;
    if (!code || !type || !value) return res.status(400).json({ error: 'Código, tipo e valor são obrigatórios' });

    const upperCode = code.toUpperCase().trim();
    const existing = await prisma.coupon.findUnique({ where: { code: upperCode } });
    if (existing) return res.status(400).json({ error: 'Cupom com este código já existe' });

    let lojouId: string | null = null;
    if (LOJOU_KEY) {
      try {
        const r = await fetch(`${LOJOU_API}/discounts`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOJOU_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: upperCode, type, value, uses_limit: max_uses || 1, active: active !== false, product_pid: process.env.LOJOU_PRODUCT_PID || 'uoEHz' }),
        });
        const d = await r.json();
        lojouId = d?.discount?.id?.toString() || d?.data?.id?.toString() || d?.id?.toString() || null;
        console.log('[ADMIN] Lojou sync:', r.status, lojouId);
      } catch (e) { console.warn('[ADMIN] Lojou sync failed:', e); }
    }

    let linkedUserEmail: string | null = null;
    if (linkedUserId) {
      const u = await prisma.user.findUnique({ where: { id: linkedUserId }, select: { email: true } });
      linkedUserEmail = u?.email || null;
    }

    const coupon = await prisma.coupon.create({
      data: { code: upperCode, type, value: parseFloat(value), maxUses: parseInt(max_uses) || 1, active: active !== false, lojouId, linkedUserId: linkedUserId || null, linkedUserEmail },
    });

    console.log(`[ADMIN] 🎟️ Coupon: ${upperCode} (${type} ${value})${lojouId ? ` [Lojou: ${lojouId}]` : ''}`);
    return res.json({ coupon, success: true });
  } catch (error) {
    console.error('[ADMIN] Create coupon error:', error);
    return res.status(500).json({ error: 'Erro ao criar cupom' });
  }
});

router.get('/cupons/:id', async (req: AuthRequest, res: Response) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });
    return res.json({ coupon });
  } catch { return res.status(500).json({ error: 'Erro ao buscar cupom' }); }
});

router.patch('/cupons/:id', async (req: AuthRequest, res: Response) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });

    const { code, type, value, max_uses, active, linkedUserId } = req.body;
    const data: any = {};
    if (code !== undefined) data.code = code.toUpperCase().trim();
    if (type !== undefined) data.type = type;
    if (value !== undefined) data.value = parseFloat(value);
    if (max_uses !== undefined) data.maxUses = parseInt(max_uses);
    if (active !== undefined) data.active = active;
    if (linkedUserId !== undefined) {
      data.linkedUserId = linkedUserId || null;
      if (linkedUserId) {
        const u = await prisma.user.findUnique({ where: { id: linkedUserId }, select: { email: true } });
        data.linkedUserEmail = u?.email || null;
      } else { data.linkedUserEmail = null; }
    }

    if (coupon.lojouId && LOJOU_KEY) {
      try {
        const lojouBody: any = {};
        if (code !== undefined) lojouBody.code = code.toUpperCase().trim();
        if (type !== undefined) lojouBody.type = type;
        if (value !== undefined) lojouBody.value = parseFloat(value);
        if (max_uses !== undefined) lojouBody.uses_limit = parseInt(max_uses);
        if (active !== undefined) lojouBody.active = active;
        await fetch(`${LOJOU_API}/discounts/${coupon.lojouId}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${LOJOU_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(lojouBody) });
      } catch {}
    }

    const updated = await prisma.coupon.update({ where: { id: req.params.id }, data });
    return res.json({ coupon: updated, success: true });
  } catch { return res.status(500).json({ error: 'Erro ao atualizar cupom' }); }
});

router.delete('/cupons/:id', async (req: AuthRequest, res: Response) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });

    if (coupon.lojouId && LOJOU_KEY) {
      try { await fetch(`${LOJOU_API}/discounts/${coupon.lojouId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${LOJOU_KEY}` } }); } catch {}
    }

    await prisma.coupon.delete({ where: { id: req.params.id } });
    console.log(`[ADMIN] 🗑️ Coupon deleted: ${coupon.code}`);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Erro ao excluir cupom' }); }
});

router.post('/cupons/send', async (req: AuthRequest, res: Response) => {
  try {
    const { couponCode, userId } = req.body;
    if (!couponCode || !userId) return res.status(400).json({ error: 'Cupom e usuário são obrigatórios' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    await prisma.coupon.updateMany({ where: { code: couponCode }, data: { linkedUserId: userId, linkedUserEmail: user.email } });

    const message = `Olá ${user.name?.split(' ')[0] || 'membro'}! 🎉\n\nTemos um presente especial para você:\n\n🎟️ *Cupom de desconto:* ${couponCode}\n\nUse este cupom no checkout para aproveitar o desconto exclusivo na sua próxima renovação do Código Zero!\n\n🔗 Acesse: ${process.env.FRONTEND_URL || 'https://codigozero.app'}\n\nAproveite antes que expire! 🚀`;

    const sent = await sendKomunika(user.phone, message);
    if (sent) {
      return res.json({ success: true, message: `Cupom enviado para ${user.name}` });
    } else {
      return res.status(500).json({ error: 'Falha ao enviar via WhatsApp — verifique configuração Komunika' });
    }
  } catch (error) {
    console.error('[ADMIN] Send coupon error:', error);
    return res.status(500).json({ error: 'Erro ao enviar cupom' });
  }
});

export default router;

