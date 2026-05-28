import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { coproducerMiddleware } from '../middlewares/coproducer.middleware';

const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);
router.use(coproducerMiddleware);

/**
 * GET /api/coproducer/me
 * Returns the coproducer's own account snapshot.
 */
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const acc = await prisma.coproducerAccount.findUnique({
      where: { id: req.coproducer!.id },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
    });
    if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json({
      id: acc.id,
      code: acc.code,
      productPid: acc.productPid,
      planId: acc.planId,
      publicCheckoutUrl: acc.publicCheckoutUrl,
      sharePct: acc.sharePct,
      bumpProductPid: acc.bumpProductPid,
      bumpPrice: acc.bumpPrice,
      displayName: acc.displayName || acc.user.name,
      enabled: acc.enabled,
      user: acc.user,
      landingUrl: `https://czero.sbs/c/${acc.code}`,
    });
  } catch (error) {
    console.error('[COPRODUCER] /me error:', error);
    res.status(500).json({ error: 'Erro ao carregar conta' });
  }
});

/**
 * GET /api/coproducer/finance
 *
 * Same filters as /admin/finance (period today/7d/30d/12m/custom,
 * search, page, limit) but constrained to this coproducer's
 * transactions. Returns the same metrics shape so the frontend can
 * reuse the admin/finance UI verbatim.
 */
router.get('/finance', async (req: AuthRequest, res: Response) => {
  try {
    const coproducerId = req.coproducer!.id;
    const period = (req.query.period as string) || '30d';
    const search = ((req.query.search as string) || '').trim();
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(200, Math.max(5, parseInt((req.query.limit as string) || '25', 10)));

    const now = new Date();
    let startDate = new Date(now);
    let endDate = new Date(now);

    if (period === 'today') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === '7d') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === '30d') {
      startDate.setDate(now.getDate() - 30);
    } else if (period === '12m') {
      startDate.setMonth(now.getMonth() - 12);
    } else if (period === 'custom') {
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) return res.status(400).json({ error: 'period=custom requer from e to' });
      startDate = new Date(from);
      endDate = new Date(to);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'datas inválidas' });
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) endDate.setHours(23, 59, 59, 999);
    } else {
      startDate.setDate(now.getDate() - 30);
    }
    const windowMs = endDate.getTime() - startDate.getTime();
    const prevStart = new Date(startDate.getTime() - windowMs);
    const prevEnd = new Date(startDate);

    const searchClause = search
      ? {
          OR: [
            { userName: { contains: search, mode: 'insensitive' as const } },
            { userEmail: { contains: search, mode: 'insensitive' as const } },
            { userPhone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const baseWhere = { coproducerId, ...searchClause };

    const [current, previous] = await Promise.all([
      prisma.transaction.findMany({
        where: { ...baseWhere, status: 'approved', createdAt: { gte: startDate, lte: endDate } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.transaction.findMany({
        where: { ...baseWhere, status: 'approved', createdAt: { gte: prevStart, lt: prevEnd } },
      }),
    ]);

    const sum = (xs: { amount: number }[]) => xs.reduce((s, t) => s + t.amount, 0);
    const growth = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);

    const revenue = sum(current);
    const newTx = current.filter((t) => !t.isRenewal);
    const renTx = current.filter((t) => t.isRenewal);

    // Coproducer's share — documentation only, since Lojou itself splits
    // the money. Useful to show "you earned X this period" in the UI.
    const sharePct = req.coproducer!.sharePct;
    const yourShareRevenue = (revenue * sharePct) / 100;

    // Active subscribers attributed via referredByCoproducer
    const activePaidUsers = await prisma.user.count({
      where: {
        role: 'member',
        subscriptionStatus: 'active',
        referredByCoproducer: req.coproducer!.code,
      },
    });

    const expectedRenewals = await prisma.user.count({
      where: {
        referredByCoproducer: req.coproducer!.code,
        subscriptionEnd: { gte: startDate, lte: endDate },
      },
    });
    const renewalRate = expectedRenewals === 0 ? null : Math.min(100, (renTx.length / expectedRenewals) * 100);
    const churnRate = renewalRate == null ? null : Math.max(0, 100 - renewalRate);

    // Chart
    const days = Math.ceil(windowMs / (24 * 60 * 60 * 1000));
    const groupByMonth = period === '12m' || days > 90;
    const chartMap = new Map<string, { new: number; renewal: number }>();
    if (groupByMonth) {
      const monthsBack = Math.min(24, Math.max(2, Math.ceil(days / 30)));
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        chartMap.set(d.toLocaleString('pt-MZ', { month: 'short', year: '2-digit' }), { new: 0, renewal: 0 });
      }
      current.forEach((t) => {
        const k = new Date(t.createdAt).toLocaleString('pt-MZ', { month: 'short', year: '2-digit' });
        if (chartMap.has(k)) {
          const s = chartMap.get(k)!;
          if (t.isRenewal) s.renewal += t.amount; else s.new += t.amount;
        }
      });
    } else {
      for (let i = Math.max(0, days - 1); i >= 0; i--) {
        const d = new Date(endDate);
        d.setDate(d.getDate() - i);
        const k = d.toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit' });
        chartMap.set(k, { new: 0, renewal: 0 });
      }
      current.forEach((t) => {
        const k = new Date(t.createdAt).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit' });
        if (chartMap.has(k)) {
          const s = chartMap.get(k)!;
          if (t.isRenewal) s.renewal += t.amount; else s.new += t.amount;
        }
      });
    }
    const chartData = Array.from(chartMap.entries()).map(([date, v]) => ({
      date, amount: v.new + v.renewal, new: v.new, renewal: v.renewal,
    }));

    // Paginated transactions
    const txWhere = {
      coproducerId,
      createdAt: { gte: startDate, lte: endDate },
      ...searchClause,
    };
    const [txTotal, txItems] = await Promise.all([
      prisma.transaction.count({ where: txWhere }),
      prisma.transaction.findMany({
        where: txWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, orderId: true, userName: true, userEmail: true, userPhone: true,
          amount: true, status: true, createdAt: true, paymentMethod: true,
          isRenewal: true, isCloseFriends: true, orderBumpAmount: true,
        },
      }),
    ]);

    res.json({
      window: { period, from: startDate.toISOString(), to: endDate.toISOString() },
      metrics: {
        revenue,
        revenueGrowth: growth(revenue, sum(previous)),
        ticket: current.length > 0 ? revenue / current.length : 0,
        ticketGrowth: 0,
        count: current.length,
        countGrowth: growth(current.length, previous.length),
        newRevenue: sum(newTx),
        newCount: newTx.length,
        renewalRevenue: sum(renTx),
        renewalCount: renTx.length,
        yourShareRevenue,
        sharePct,
        activePaidUsers,
        renewalRate,
        churnRate,
        expectedRenewals,
        realizedRenewals: renTx.length,
      },
      chartData,
      transactions: { total: txTotal, page, limit, items: txItems },
    });
  } catch (error) {
    console.error('[COPRODUCER] /finance error:', error);
    res.status(500).json({ error: 'Erro ao carregar finanças' });
  }
});

/**
 * GET /api/coproducer/leads
 * Leads (subscriptionStatus='lead') attributed to this coproducer via
 * the User.referredByCoproducer pointer.
 */
router.get('/leads', async (req: AuthRequest, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const limit = Math.min(500, Math.max(10, parseInt((req.query.limit as string) || '100', 10)));
    const leads = await prisma.user.findMany({
      where: {
        referredByCoproducer: req.coproducer!.code,
        subscriptionStatus: 'lead',
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, name: true, email: true, phone: true,
        remarketingStage: true, createdAt: true, checkoutUrl: true,
      },
    });
    res.json({ leads });
  } catch (error) {
    console.error('[COPRODUCER] /leads error:', error);
    res.status(500).json({ error: 'Erro ao carregar leads' });
  }
});

/**
 * GET /api/coproducer/users
 * Active or paid users attributed to this coproducer.
 */
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const search = ((req.query.search as string) || '').trim();
    const limit = Math.min(500, Math.max(10, parseInt((req.query.limit as string) || '100', 10)));
    const users = await prisma.user.findMany({
      where: {
        referredByCoproducer: req.coproducer!.code,
        subscriptionStatus: { not: 'lead' },
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, name: true, email: true, phone: true,
        subscriptionStatus: true, subscriptionStart: true, subscriptionEnd: true,
        closeFriends: true, createdAt: true,
      },
    });
    res.json({ users });
  } catch (error) {
    console.error('[COPRODUCER] /users error:', error);
    res.status(500).json({ error: 'Erro ao carregar usuários' });
  }
});

/**
 * GET /api/coproducer/upcoming-renewals
 */
router.get('/upcoming-renewals', async (req: AuthRequest, res: Response) => {
  try {
    const days = Math.min(180, Math.max(1, parseInt((req.query.days as string) || '30', 10)));
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const users = await prisma.user.findMany({
      where: {
        referredByCoproducer: req.coproducer!.code,
        role: 'member',
        subscriptionStatus: 'active',
        subscriptionEnd: { gte: now, lte: cutoff },
      },
      orderBy: { subscriptionEnd: 'asc' },
      take: 50,
      select: { id: true, name: true, email: true, phone: true, subscriptionEnd: true, closeFriends: true },
    });
    res.json({
      days,
      count: users.length,
      users: users.map((u) => ({
        ...u,
        daysUntilExpiry: u.subscriptionEnd
          ? Math.max(0, Math.ceil((u.subscriptionEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
          : null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar próximas renovações' });
  }
});

export default router;
