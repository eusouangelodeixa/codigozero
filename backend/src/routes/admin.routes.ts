import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';

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
    const vagasRestantes = (config?.maxUsers || 50) - (config?.currentUsers || 0);

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

router.get('/scripts', async (_req: AuthRequest, res: Response) => {
  try {
    const scripts = await prisma.script.findMany({ orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }] });
    res.json({ scripts });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar scripts' });
  }
});

router.post('/scripts', async (req: AuthRequest, res: Response) => {
  try {
    const { title, category, content, icon, sortOrder } = req.body;
    const script = await prisma.script.create({
      data: { title, category, content, icon, sortOrder: sortOrder || 0 },
    });
    res.json({ script });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar script' });
  }
});

router.patch('/scripts/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { title, category, content, icon, sortOrder } = req.body;
    const script = await prisma.script.update({
      where: { id: req.params.id },
      data: { title, category, content, icon, sortOrder },
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
    const { vslEmbedUrl, vslEmbedHtml, heroTitle, heroSubtitle, heroDesc, ctaText, priceAmount, maxVagas, sections } = req.body;
    const config = await prisma.landingConfig.upsert({
      where: { id: 'singleton' },
      update: { vslEmbedUrl, vslEmbedHtml, heroTitle, heroSubtitle, heroDesc, ctaText, priceAmount, maxVagas, sections },
      create: { id: 'singleton', vslEmbedUrl, vslEmbedHtml, heroTitle, heroSubtitle, heroDesc, ctaText, priceAmount, maxVagas, sections },
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
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar config do sistema' });
  }
});

router.patch('/system', async (req: AuthRequest, res: Response) => {
  try {
    const { maxUsers, communityLink, mentoriaSchedule, mentoriaLink } = req.body;
    const config = await prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: { maxUsers, communityLink, mentoriaSchedule, mentoriaLink },
      create: { id: 'singleton', maxUsers, communityLink, mentoriaSchedule, mentoriaLink },
    });
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar config do sistema' });
  }
});

export default router;
