import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { sendPushBroadcast } from './auth.routes';
import { sendPushToSuperAdmins, sendPushToUser } from './auth.routes';
import {
  markWithdrawalPaid,
  rejectWithdrawal,
} from '../services/affiliate.service';
import { env } from '../config/env';
import { lojouService, LojouService } from '../services/lojou.service';
import { getActivePrice, invalidatePriceCache } from '../lib/pricing';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { deprovisionKomunika } from '../services/komunika.service';
import { createCost, deleteCost, listCosts, costTotals, COST_CATEGORIES } from '../services/cost.service';
import { initiateSdrOutbound } from '../services/sdr.service';
import { buildSurveyContext } from '../services/lifecycle.service';
import { sendCredentialsEmail } from '../services/payment.service';

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
      // Pagantes reais = assinatura ativa COM pagamento de verdade. Excluímos
      // grantedManually (acessos liberados pelo admin: comp/trial/refund) — eles
      // recebem um lojouOrderId sintético "MANUAL_…", então o filtro
      // lojouOrderId != null sozinho não basta. Sem isso, o MRR (paidUsers ×
      // preço) e o card "Pagos · ativos" inflavam com quem não paga. Mesma
      // regra do /finance (activePaidUsers).
      // Pagantes reais: Lojou (lojouOrderId) OU Stripe (stripeSubscriptionId).
      prisma.user.count({ where: { subscriptionStatus: 'active', role: 'member', grantedManually: false, OR: [{ lojouOrderId: { not: null } }, { stripeSubscriptionId: { not: null } }] } }),
      prisma.transaction.findMany({ where: { status: 'approved' }, select: { amount: true } }),
      prisma.systemConfig.findFirst({ where: { id: 'singleton' } }),
    ]);

    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    const mrr = paidUsers * (await getActivePrice());
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
    const filter = req.query.filter as string; // all, paid, unpaid, subscriber
    const search = req.query.search as string;
    const period = req.query.period as string; // today | 7d | 30d | custom | all
    const status = req.query.status as string; // optional explicit subscriptionStatus

    let where: any = {};

    if (filter === 'paid' || filter === 'subscriber') {
      where.subscriptionStatus = 'active';
      where.lojouOrderId = { not: null };
    } else if (filter === 'unpaid') {
      where.subscriptionStatus = 'lead';
    }
    // Explicit single-status filter overrides the coarse paid/unpaid one.
    if (status && status !== 'all') {
      where.subscriptionStatus = status;
      delete where.lojouOrderId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const window = dateWindowFromQuery(period, req.query.from as string, req.query.to as string);
    if (window) where.createdAt = window;

    const leads = await prisma.user.findMany({
      where: { ...where, role: 'member' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, phone: true,
        subscriptionStatus: true, subscriptionEnd: true, lojouOrderId: true, createdAt: true,
      },
    });

    res.json({ leads, total: leads.length });
  } catch (error) {
    console.error('[ADMIN] Leads error:', error);
    res.status(500).json({ error: 'Erro ao carregar leads' });
  }
});

// GET /api/admin/leads/export — CSV of the leads list with the SAME filters as
// GET /api/admin/leads. MUST be registered before '/leads/:id' below, otherwise
// Express treats "export" as an :id and 404s. CSV helpers live near the bottom.
router.get('/leads/export', async (req: AuthRequest, res: Response) => {
  try {
    const filter = req.query.filter as string;
    const search = req.query.search as string;
    const period = req.query.period as string;
    const status = req.query.status as string;

    let where: any = {};
    if (filter === 'paid' || filter === 'subscriber') {
      where.subscriptionStatus = 'active';
      where.lojouOrderId = { not: null };
    } else if (filter === 'unpaid') {
      where.subscriptionStatus = 'lead';
    }
    if (status && status !== 'all') {
      where.subscriptionStatus = status;
      delete where.lojouOrderId;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    const window = dateWindowFromQuery(period, req.query.from as string, req.query.to as string);
    if (window) where.createdAt = window;

    const leads = await prisma.user.findMany({
      where: { ...where, role: 'member' },
      orderBy: { createdAt: 'desc' },
      select: {
        name: true, email: true, phone: true,
        subscriptionStatus: true, subscriptionEnd: true, lojouOrderId: true, createdAt: true,
      },
    });

    const headers = ['Nome', 'Email', 'Telefone', 'Status', 'Pedido Lojou', 'Expira em', 'Cadastro'];
    const rows = leads.map((l) => [
      l.name, l.email, l.phone, l.subscriptionStatus, l.lojouOrderId,
      l.subscriptionEnd, l.createdAt,
    ]);
    sendCsv(res, 'leads', buildCsv(headers, rows));
  } catch (error) {
    console.error('[ADMIN] Leads export error:', error);
    res.status(500).json({ error: 'Erro ao exportar leads' });
  }
});

// Full profile for one lead/user — powers the detail drawer in /admin/leads.
// Bundles the user row, their subscription/payment history and a few activity
// counters so the admin sees the whole picture in one click.
router.get('/leads/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        affiliateAccount: { select: { code: true, enabled: true } },
        coproducerAccount: { select: { code: true, displayName: true } },
        _count: { select: { leads: true, dispatchLogs: true, chatMessages: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'Lead não encontrado' });

    // Transaction has no FK to User — it's matched by the email/phone captured
    // at checkout time. Covers both shapes in case one was missing on an order.
    const transactions = await prisma.transaction.findMany({
      where: { OR: [{ userEmail: user.email }, { userPhone: user.phone }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const lessonsCompleted = await prisma.lessonProgress.count({
      where: { userId: user.id, completed: true },
    });

    const approved = transactions.filter((t) => t.status === 'approved');
    const totalPaid = approved.reduce((sum, t) => sum + (t.amount || 0), 0);

    const lead: any = { ...user };
    delete lead.passwordHash;

    res.json({
      lead,
      transactions,
      stats: {
        totalPaid,
        paymentsCount: approved.length,
        firstPaymentAt: approved.length ? approved[approved.length - 1].createdAt : null,
        lastPaymentAt: approved.length ? approved[0].createdAt : null,
        scrapedLeads: user._count.leads,
        dispatchesSent: user._count.dispatchLogs,
        chatMessages: user._count.chatMessages,
        lessonsCompleted,
      },
    });
  } catch (error) {
    console.error('[ADMIN] Lead detail error:', error);
    res.status(500).json({ error: 'Erro ao carregar detalhes do lead' });
  }
});

// ═══════════════════════════════════════
// FINANCE
// ═══════════════════════════════════════

/**
 * GET /api/admin/finance
 *
 * Query:
 *   period: 'today' | '7d' | '30d' | '12m' | 'custom'
 *   from, to: ISO dates (required when period=custom)
 *   search:  case-insensitive substring matched against userName / userEmail / userPhone
 *   page, limit: paginated transaction list (defaults 1 / 25)
 *
 * Returns metrics for the chosen window, a comparison vs the previous
 * equal-length window, a chart series, and a paginated transactions
 * list with new-vs-renewal split.
 */
router.get('/finance', async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '30d';
    const search = ((req.query.search as string) || '').trim();
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(200, Math.max(5, parseInt((req.query.limit as string) || '25', 10)));
    // Source filter: 'all' (default), 'principal' (coproducerId IS NULL),
    // or a specific CoproducerAccount.id. Lets the admin see consolidated
    // numbers OR drill into just the principal product OR a single
    // coproducer without mixing them.
    const source = ((req.query.source as string) || 'all').trim();
    // Transaction-list filters (apply to the paginated list only, NOT the
    // window metrics — those always reflect every approved sale).
    const txType = ((req.query.txType as string) || 'all').trim(); // all | new | renewal | closeFriends
    const txStatus = ((req.query.txStatus as string) || 'all').trim(); // all | approved | failed | refunded | pending

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
      if (!from || !to) {
        return res.status(400).json({ error: 'period=custom requer from e to em ISO' });
      }
      startDate = new Date(from);
      endDate = new Date(to);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'datas inválidas (ISO esperado)' });
      }
      // Inclusive end-of-day if `to` looked like a bare date
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) endDate.setHours(23, 59, 59, 999);
    } else {
      startDate.setDate(now.getDate() - 30);
    }

    const windowMs = endDate.getTime() - startDate.getTime();
    const previousStartDate = new Date(startDate.getTime() - windowMs);
    const previousEndDate = new Date(startDate);

    // Search clause shared by both windows
    const searchClause = search
      ? {
          OR: [
            { userName: { contains: search, mode: 'insensitive' as const } },
            { userEmail: { contains: search, mode: 'insensitive' as const } },
            { userPhone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    // Source filter clause
    const sourceClause =
      source === 'principal'
        ? { coproducerId: null }
        : source && source !== 'all'
          ? { coproducerId: source }
          : {};

    const [currentTransactions, previousTransactions] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          status: 'approved',
          createdAt: { gte: startDate, lte: endDate },
          ...searchClause,
          ...sourceClause,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.transaction.findMany({
        where: {
          status: 'approved',
          createdAt: { gte: previousStartDate, lt: previousEndDate },
          ...searchClause,
          ...sourceClause,
        },
      }),
    ]);

    // Refunds + cancellations + checkouts iniciados, no window (by original date).
    // 'refunded' = reembolso de venda; 'failed' = pedido cancelado após aprovado;
    // 'pending' = "Pagamento iniciado" (checkout começado mas não concluído —
    // order.cancelled da Lojou). Métricas separadas pra não misturar.
    const [refundedAgg, failedAgg, initiatedAgg] = await Promise.all([
      prisma.transaction.aggregate({
        where: { status: 'refunded', createdAt: { gte: startDate, lte: endDate }, ...searchClause, ...sourceClause },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: 'failed', createdAt: { gte: startDate, lte: endDate }, ...searchClause, ...sourceClause },
        _count: true,
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { status: 'pending', createdAt: { gte: startDate, lte: endDate }, ...searchClause, ...sourceClause },
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    // Costs in the window → profit = net revenue − costs. Only meaningful on
    // the consolidated view (source=all); costs aren't attributed per source.
    const costs = source === 'all' ? await costTotals({ from: startDate, to: endDate }) : { company: 0, shared: 0, total: 0, count: 0 };

    // ── Metrics ────────────────────────────────────────────────────────
    const sum = (xs: { amount: number }[]) => xs.reduce((s, t) => s + t.amount, 0);
    const growth = (curr: number, prev: number) =>
      prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

    const currentRevenue = sum(currentTransactions);
    const previousRevenue = sum(previousTransactions);
    const revenueGrowth = growth(currentRevenue, previousRevenue);

    const currentCount = currentTransactions.length;
    const previousCount = previousTransactions.length;
    const countGrowth = growth(currentCount, previousCount);

    const currentTicket = currentCount > 0 ? currentRevenue / currentCount : 0;
    const previousTicket = previousCount > 0 ? previousRevenue / previousCount : 0;
    const ticketGrowth = growth(currentTicket, previousTicket);

    // New vs Renewal split
    const newTx = currentTransactions.filter((t) => !t.isRenewal);
    const renewalTx = currentTransactions.filter((t) => t.isRenewal);
    const newRevenue = sum(newTx);
    const renewalRevenue = sum(renewalTx);

    // Close Friends slice (audit)
    const cfTx = currentTransactions.filter((t) => t.isCloseFriends);
    const cfRevenue = sum(cfTx);

    // Active MRR snapshot (independent of the period — current state).
    // Excludes grantedManually users (free/comp subs) so the MRR reflects
    // what actually arrives every month — not "if everyone paid full price".
    // MRR is now active users × NET ticket of recent paid transactions
    // (last 90 days), which respects the Lojou fee + coproducer split.
    // We expose both the theoretical (publishedPrice × users) and the
    // realistic (netTicket × users) so admin can compare.
    const activePaidUsers = await prisma.user.count({
      where: {
        subscriptionStatus: 'active',
        role: 'member',
        grantedManually: false,
        // Pagante real = pagou via Lojou (lojouOrderId) OU via Stripe
        // (stripeSubscriptionId, assinantes internacionais). Sem o ramo
        // Stripe eles ficavam de fora do MRR/Pagos·ativos.
        OR: [{ lojouOrderId: { not: null } }, { stripeSubscriptionId: { not: null } }],
      },
    });
    const activePrice = await getActivePrice();
    const mrrTheoretical = activePaidUsers * activePrice;

    const last90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const recentPaid = await prisma.transaction.findMany({
      where: { status: 'approved', createdAt: { gte: last90 } },
      select: { amount: true },
    });
    const recentNet = recentPaid.length > 0
      ? recentPaid.reduce((s, t) => s + t.amount, 0) / recentPaid.length
      : 0;
    const mrr = Math.round(activePaidUsers * recentNet);

    // ── Renewal funnel for the window ──────────────────────────────────
    // "Expected renewals" = users whose subscriptionEnd fell within the
    // window (their subscription was up for renewal). "Realized" = those
    // who paid a renewal in the window (or paid before but extended past
    // it). Simple, conservative proxy for churn.
    const expectedRenewals = await prisma.user.count({
      where: { subscriptionEnd: { gte: startDate, lte: endDate } },
    });
    const realizedRenewalsCount = renewalTx.length;
    const renewalRate = expectedRenewals === 0
      ? null
      : Math.min(100, (realizedRenewalsCount / expectedRenewals) * 100);
    const churnRate = renewalRate == null ? null : Math.max(0, 100 - renewalRate);

    // ── Chart data ─────────────────────────────────────────────────────
    const days = Math.ceil(windowMs / (24 * 60 * 60 * 1000));
    const groupByMonth = period === '12m' || days > 90;
    const chartDataMap = new Map<string, { new: number; renewal: number }>();

    if (groupByMonth) {
      const monthsBack = Math.min(24, Math.max(2, Math.ceil(days / 30)));
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        chartDataMap.set(
          d.toLocaleString('pt-MZ', { month: 'short', year: '2-digit' }),
          { new: 0, renewal: 0 },
        );
      }
      currentTransactions.forEach((t) => {
        const key = new Date(t.createdAt).toLocaleString('pt-MZ', { month: 'short', year: '2-digit' });
        if (chartDataMap.has(key)) {
          const slot = chartDataMap.get(key)!;
          if (t.isRenewal) slot.renewal += t.amount;
          else slot.new += t.amount;
        }
      });
    } else {
      // Group by day, walking back from `endDate` so custom ranges line up
      for (let i = Math.max(0, days - 1); i >= 0; i--) {
        const d = new Date(endDate);
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit' });
        chartDataMap.set(key, { new: 0, renewal: 0 });
      }
      currentTransactions.forEach((t) => {
        const key = new Date(t.createdAt).toLocaleDateString('pt-MZ', { day: '2-digit', month: '2-digit' });
        if (chartDataMap.has(key)) {
          const slot = chartDataMap.get(key)!;
          if (t.isRenewal) slot.renewal += t.amount;
          else slot.new += t.amount;
        }
      });
    }
    const chartData = Array.from(chartDataMap.entries()).map(([date, v]) => ({
      date,
      amount: v.new + v.renewal,
      new: v.new,
      renewal: v.renewal,
    }));

    // ── Paginated transactions list (windowed + searched + source) ─────
    const typeClause =
      txType === 'new'
        ? { isRenewal: false }
        : txType === 'renewal'
          ? { isRenewal: true }
          : txType === 'closeFriends'
            ? { isCloseFriends: true }
            : {};
    const statusClause = txStatus && txStatus !== 'all' ? { status: txStatus } : {};
    const txWhere = {
      createdAt: { gte: startDate, lte: endDate },
      ...searchClause,
      ...sourceClause,
      ...typeClause,
      ...statusClause,
    };
    const [txTotal, txItems] = await Promise.all([
      prisma.transaction.count({ where: txWhere }),
      prisma.transaction.findMany({
        where: txWhere,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          orderId: true,
          userName: true,
          userEmail: true,
          userPhone: true,
          amount: true,
          grossAmount: true,
          lojouFee: true,
          coproducerFee: true,
          status: true,
          createdAt: true,
          paymentMethod: true,
          isRenewal: true,
          isCloseFriends: true,
          orderBumpAmount: true,
          coproducerId: true,
          coproducer: { select: { id: true, code: true, displayName: true, user: { select: { name: true } } } },
          gateway: true,
          stripePaymentIntentId: true,
        },
      }),
    ]);

    // ── Fee breakdown + truthful net revenue (window) ──────────────────
    // grossRevenue = gross the customers paid (principal + bump). lojouFee +
    // coproducerFee are what's deducted on top of it. netRevenue is what
    // actually lands with us, and LUCRO LÍQUIDO (profit) = netRevenue − costs
    // — NOT gross − costs, which used to overstate profit by the whole Lojou
    // fee. (grossAmount/lojouFee are now stored from the real charged amount;
    // historical 797-polluted rows were backfilled.)
    const grossRevenue = currentTransactions.reduce((s, t) => s + (t.grossAmount || t.amount), 0);
    const totalLojouFee = currentTransactions.reduce((s, t) => s + (t.lojouFee || 0), 0);
    const totalCoproducerFee = currentTransactions.reduce((s, t) => s + (t.coproducerFee || 0), 0);
    const netRevenue = currentRevenue - totalLojouFee - totalCoproducerFee;

    res.json({
      window: { period, from: startDate.toISOString(), to: endDate.toISOString(), source },
      metrics: {
        revenue: currentRevenue,
        revenueGrowth,
        ticket: currentTicket,
        ticketGrowth,
        count: currentCount,
        countGrowth,
        newRevenue,
        newCount: newTx.length,
        renewalRevenue,
        renewalCount: renewalTx.length,
        closeFriendsRevenue: cfRevenue,
        closeFriendsCount: cfTx.length,
        mrr,
        mrrTheoretical,
        netTicketAvg: Math.round(recentNet),
        // Fee breakdown (window)
        grossRevenue,
        totalLojouFee,
        totalCoproducerFee,
        netRevenue: Math.round(netRevenue * 100) / 100,
        activePaidUsers,
        renewalRate,
        churnRate,
        expectedRenewals,
        realizedRenewals: realizedRenewalsCount,
        // Losses in the window
        refundedCount: refundedAgg._count || 0,
        refundedAmount: refundedAgg._sum.amount || 0,
        failedCount: failedAgg._count || 0,
        failedAmount: failedAgg._sum.amount || 0,
        // Pagamento iniciado (checkout começado, não concluído)
        initiatedCount: initiatedAgg._count || 0,
        initiatedAmount: initiatedAgg._sum.amount || 0,
        // Costs + profit (net revenue − costs) in the window
        costsTotal: costs.total,
        costsCompany: costs.company,
        costsShared: costs.shared,
        profit: Math.round((netRevenue - costs.total) * 100) / 100,
      },
      chartData,
      transactions: {
        total: txTotal,
        page,
        limit,
        items: txItems,
      },
      // Kept for backwards compat with the older UI panel
      recentTransactions: txItems,
    });
  } catch (error) {
    console.error('[ADMIN] Finance error:', error);
    res.status(500).json({ error: 'Erro ao carregar dados financeiros' });
  }
});

/**
 * GET /api/admin/finance/upcoming-renewals
 *
 * Users whose subscription ends within the next `days` (default 30),
 * still active, ordered by closest expiry. Useful to anticipate churn.
 */
router.get('/finance/upcoming-renewals', async (req: AuthRequest, res: Response) => {
  try {
    const days = Math.min(180, Math.max(1, parseInt((req.query.days as string) || '30', 10)));
    const limit = Math.min(200, Math.max(10, parseInt((req.query.limit as string) || '50', 10)));
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: {
        role: 'member',
        subscriptionStatus: 'active',
        subscriptionEnd: { gte: now, lte: cutoff },
      },
      orderBy: { subscriptionEnd: 'asc' },
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        subscriptionEnd: true,
        closeFriends: true,
        renewalUrl: true,
      },
    });

    res.json({
      days,
      now: now.toISOString(),
      cutoff: cutoff.toISOString(),
      count: users.length,
      users: users.map((u) => ({
        ...u,
        daysUntilExpiry: u.subscriptionEnd
          ? Math.max(0, Math.ceil((u.subscriptionEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
          : null,
      })),
    });
  } catch (error) {
    console.error('[ADMIN] Upcoming renewals error:', error);
    res.status(500).json({ error: 'Erro ao carregar próximas renovações' });
  }
});

// ═══════════════════════════════════════
// USERS
// ═══════════════════════════════════════

router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    const status = req.query.status as string; // active | overdue | grace_period | canceled | lead
    const role = req.query.role as string;     // member | admin | superadmin
    const period = req.query.period as string;  // filters createdAt
    const page = parseInt(req.query.page as string) || 1;
    const perPage = 20;

    let where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status && status !== 'all') where.subscriptionStatus = status;
    if (role && role !== 'all') where.role = role;
    const window = dateWindowFromQuery(period, req.query.from as string, req.query.to as string);
    if (window) where.createdAt = window;

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
          firstAccessAt: true,
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

// GET /api/admin/users/export — CSV of the users list with the SAME filters as
// GET /api/admin/users (no pagination; exports the whole filtered set). MUST be
// registered before '/users/:id' below so "export" isn't matched as an :id.
router.get('/users/export', async (req: AuthRequest, res: Response) => {
  try {
    const search = req.query.search as string;
    const status = req.query.status as string;
    const role = req.query.role as string;
    const period = req.query.period as string;

    let where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status && status !== 'all') where.subscriptionStatus = status;
    if (role && role !== 'all') where.role = role;
    const window = dateWindowFromQuery(period, req.query.from as string, req.query.to as string);
    if (window) where.createdAt = window;

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        name: true, email: true, phone: true, role: true,
        isActive: true, subscriptionStatus: true, subscriptionEnd: true,
        lojouOrderId: true, dailySearchCount: true, firstAccessAt: true, createdAt: true,
      },
    });

    const headers = [
      'Nome', 'Email', 'Telefone', 'Papel', 'Status assinatura', 'Ativo',
      'Pedido Lojou', 'Expira em', 'Primeiro acesso', 'Buscas hoje', 'Criado em',
    ];
    const rows = users.map((u) => [
      u.name, u.email, u.phone, u.role, u.subscriptionStatus, u.isActive,
      u.lojouOrderId, u.subscriptionEnd, u.firstAccessAt, u.dailySearchCount, u.createdAt,
    ]);
    sendCsv(res, 'usuarios', buildCsv(headers, rows));
  } catch (error) {
    console.error('[ADMIN] Users export error:', error);
    res.status(500).json({ error: 'Erro ao exportar usuários' });
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
    const { name, email, role, isActive, subscriptionStatus, subscriptionStart, subscriptionEnd, password, phone, grantedManually, lojouOrderId, grantAccess } = req.body;
    const existing = await prisma.user.findUnique({ where: { id: req.params.id }, select: { lojouOrderId: true, grantedManually: true, komunikaCompanyId: true, komunikaDeprovisionedAt: true } });
    if (!existing) return res.status(404).json({ error: 'Usuário não encontrado' });

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (subscriptionStatus !== undefined) data.subscriptionStatus = subscriptionStatus;
    if (subscriptionStart !== undefined) data.subscriptionStart = subscriptionStart ? new Date(subscriptionStart) : null;
    if (subscriptionEnd !== undefined) data.subscriptionEnd = subscriptionEnd ? new Date(subscriptionEnd) : null;
    if (password) data.passwordHash = await bcrypt.hash(password, 10);

    // ── Manual access grant (comp / trial / refund recovery) ──────────
    // When the admin grants access without a real payment, mark the user
    // as grantedManually so MRR/revenue counts skip them. We synthesize
    // a "MANUAL_<userId>" pseudo-orderId to satisfy the existing
    // "lojouOrderId IS NOT NULL" checks that gate paid features.
    if (grantAccess === true) {
      data.grantedManually = true;
      data.subscriptionStatus = subscriptionStatus || 'active';
      if (!existing.lojouOrderId) {
        data.lojouOrderId = `MANUAL_${req.params.id.slice(0, 8)}`;
      }
      if (!subscriptionStart) data.subscriptionStart = new Date();
      if (!subscriptionEnd) {
        // Default 30 days unless caller supplied
        data.subscriptionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    } else if (grantedManually !== undefined) {
      data.grantedManually = !!grantedManually;
    }

    // Explicit lojouOrderId from the request body. If it doesn't look
    // like a real Lojou order number (digits) we treat it as a manual
    // grant marker too — defensive guard against past stamp-and-forget
    // patterns like the Kelvin case.
    if (lojouOrderId !== undefined) {
      const s = lojouOrderId == null ? null : String(lojouOrderId).trim();
      data.lojouOrderId = s || null;
      if (s && !/^\d+$/.test(s) && !s.startsWith('MANUAL_')) {
        data.grantedManually = true;
      }
    }

    const user = await prisma.user.update({ where: { id: req.params.id }, data });

    // If the admin manually deactivated / cancelled this user, revoke Komunika
    // too (no-op if they never had a tenant). Fire-and-forget.
    const deactivated =
      data.isActive === false ||
      (typeof data.subscriptionStatus === 'string' && ['canceled', 'overdue'].includes(data.subscriptionStatus));
    if (deactivated && existing.komunikaCompanyId && !existing.komunikaDeprovisionedAt) {
      deprovisionKomunika(req.params.id, 'cancelled').catch((e) =>
        console.error('[ADMIN] Komunika deprovision failed (non-blocking):', e?.message || e),
      );
    }

    res.json({ user });
  } catch (error) {
    console.error('[ADMIN] Update user error:', error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    // Best-effort revoke the Komunika tenant just before the hard delete.
    // Fire-and-forget — must NOT block the delete on a Komunika outage. It
    // re-fetches the user, so it must be dispatched before the row is gone;
    // the small race (delete wins → no-op) is acceptable for a hard delete.
    const u = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { komunikaCompanyId: true, komunikaDeprovisionedAt: true },
    });
    if (u?.komunikaCompanyId && !u.komunikaDeprovisionedAt) {
      deprovisionKomunika(req.params.id, 'other').catch((e) =>
        console.error('[ADMIN] Komunika deprovision on delete failed (non-blocking):', e?.message || e),
      );
    }
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
    }, 'system').catch(() => {});

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
    const {
      vslEmbedUrl,
      vslEmbedHtml,
      heroTitle,
      heroSubtitle,
      heroDesc,
      ctaText,
      priceAmount,
      maxVagas,
      sections,
      headScripts,
      headScriptBlocks,
      bodyScripts,
      affiliateVslEmbedHtml,
      affiliateCreativesUrl,
    } = req.body;
    const data = {
      vslEmbedUrl,
      vslEmbedHtml,
      heroTitle,
      heroSubtitle,
      heroDesc,
      ctaText,
      priceAmount,
      maxVagas,
      sections,
      headScripts,
      headScriptBlocks,
      bodyScripts,
      affiliateVslEmbedHtml,
      affiliateCreativesUrl,
    };
    // Capture the prior price so we only call Lojou when it actually changes.
    const prior = await prisma.landingConfig.findUnique({
      where: { id: 'singleton' },
      select: { priceAmount: true },
    });

    const config = await prisma.landingConfig.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });

    // Always invalidate the in-process price cache so the next checkout/cron
    // sees the new value within milliseconds, not 30s.
    invalidatePriceCache();

    // Push the new price upstream to Lojou (PATCH /v1/plans/{id}) so that
    // every checkout — including ones opened directly via pay.lojou.app —
    // charges the value set in the admin. Failure is non-fatal: the local
    // change is already saved and our checkouts read getActivePrice().
    let lojouSync: { ok: boolean; error?: string } | null = null;
    if (
      priceAmount !== undefined &&
      priceAmount !== null &&
      Number.isFinite(Number(priceAmount)) &&
      Number(priceAmount) !== prior?.priceAmount &&
      env.LOJOU_API_KEY &&
      env.LOJOU_PLAN_ID
    ) {
      try {
        await lojouService.updatePlan(env.LOJOU_PLAN_ID, { price: Number(priceAmount) });
        lojouSync = { ok: true };
        console.log(`[ADMIN] 💰 Lojou plan ${env.LOJOU_PLAN_ID} price updated to ${priceAmount}`);
      } catch (e: any) {
        lojouSync = { ok: false, error: e?.message || 'unknown' };
        console.warn('[ADMIN] Lojou updatePlan failed:', e?.message || e);
      }
    }

    res.json({ config, lojouSync });
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
    const { maxUsers, communityLink, mentoriaSchedule, mentoriaLink, komunikaVisitorAssistantId, komunikaCheckoutAssistantId, komunikaAdminApiKey, komunikaInstanceId, milestoneAlertPhone, milestoneAlertName, resendApiKey, resendFrom, resendWebhookSecret } = req.body;
    const config = await prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: { maxUsers, communityLink, mentoriaSchedule, mentoriaLink, komunikaVisitorAssistantId, komunikaCheckoutAssistantId, komunikaAdminApiKey, komunikaInstanceId, milestoneAlertPhone, milestoneAlertName, resendApiKey, resendFrom, resendWebhookSecret },
      create: { id: 'singleton', maxUsers, communityLink, mentoriaSchedule, mentoriaLink, komunikaVisitorAssistantId, komunikaCheckoutAssistantId, komunikaAdminApiKey, komunikaInstanceId, milestoneAlertPhone, milestoneAlertName, resendApiKey, resendFrom, resendWebhookSecret },
    });
    res.json({ config });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar config do sistema' });
  }
});

// POST /api/admin/resend-test — sends a sample access e-mail (Resend) to a given
// address so the admin can check the visual + delivery straight from /admin/config.
router.post('/resend-test', async (req: AuthRequest, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Informe um e-mail válido.' });
    }
    const rawPassword = 'teste-' + Math.random().toString(36).slice(2, 8);
    const r = await sendCredentialsEmail({ name: 'Aluno Teste', email, rawPassword });
    if (r.ok) return res.json({ success: true, id: r.id });
    if (r.status === 'resend-not-configured') {
      return res.status(400).json({ error: 'Resend não configurado. Salve a API Key e o remetente primeiro.' });
    }
    return res.status(502).json({
      error: `Resend recusou o envio (status ${r.status}). Confira a API Key e se o domínio do remetente está verificado.`,
    });
  } catch (error) {
    console.error('[ADMIN] resend-test error:', error);
    return res.status(500).json({ error: 'Erro ao enviar e-mail de teste.' });
  }
});

// GET /api/admin/email-events — Resend delivery events GROUPED into one row per
// e-mail (by resendId): each e-mail shows its furthest status (sent → delivered →
// opened → clicked; bounce/complaint take priority) instead of one row per event.
// Returns a funnel summary too. Powers the /admin/emails panel.
router.get('/email-events', async (req: AuthRequest, res: Response) => {
  try {
    const sinceDays = Math.min(30, Math.max(1, parseInt(req.query.days as string) || 7));
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

    // Only real Resend e-mails carry a resendId; ignore stray/manual test posts.
    const rows = await prisma.emailEvent.findMany({
      where: { createdAt: { gte: since }, resendId: { not: null } },
      orderBy: { createdAt: 'asc' },
      take: 4000,
      select: { type: true, recipient: true, subject: true, resendId: true, createdAt: true },
    });

    const PRIORITY: Record<string, number> = {
      'email.complained': 100,
      'email.bounced': 90,
      'email.clicked': 70,
      'email.opened': 60,
      'email.delivered': 50,
      'email.delivery_delayed': 40,
      'email.sent': 10,
    };

    type Grouped = {
      resendId: string;
      recipient: string | null;
      subject: string | null;
      status: string;
      prio: number;
      lastAt: Date;
      types: Set<string>;
    };
    const map = new Map<string, Grouped>();
    for (const e of rows) {
      const key = e.resendId as string;
      let g = map.get(key);
      if (!g) {
        g = { resendId: key, recipient: e.recipient, subject: e.subject, status: e.type, prio: PRIORITY[e.type] ?? 0, lastAt: e.createdAt, types: new Set() };
        map.set(key, g);
      }
      g.types.add(e.type);
      if (e.recipient) g.recipient = e.recipient;
      if (e.subject) g.subject = e.subject;
      if (e.createdAt > g.lastAt) g.lastAt = e.createdAt;
      const p = PRIORITY[e.type] ?? 0;
      if (p >= g.prio) {
        g.prio = p;
        g.status = e.type;
      }
    }

    const emails = [...map.values()]
      .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
      .slice(0, 200)
      .map((g) => ({ resendId: g.resendId, recipient: g.recipient, subject: g.subject, status: g.status, lastAt: g.lastAt }));

    const counts = { sent: map.size, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 };
    for (const g of map.values()) {
      if (g.types.has('email.delivered')) counts.delivered++;
      if (g.types.has('email.opened')) counts.opened++;
      if (g.types.has('email.clicked')) counts.clicked++;
      if (g.types.has('email.bounced')) counts.bounced++;
      if (g.types.has('email.complained')) counts.complained++;
    }

    res.json({ emails, counts, sinceDays });
  } catch (error) {
    console.error('[ADMIN] email-events error:', error);
    res.status(500).json({ error: 'Erro ao carregar eventos de e-mail' });
  }
});


// ═══════════════════════════════════════
// CUSTOS / DESPESAS (somente superadmin)
// ═══════════════════════════════════════
const requireSuperadmin = (req: AuthRequest, res: Response): boolean => {
  if (req.user?.role !== 'superadmin') {
    res.status(403).json({ error: 'Apenas o superadmin pode acessar os custos.' });
    return false;
  }
  return true;
};

function parseCostPeriod(q: any): { from?: Date; to?: Date } {
  const period = (q.period as string) || '30d';
  const now = new Date();
  if (period === 'all') return {};
  if (period === 'custom') {
    const from = q.from ? new Date(q.from) : undefined;
    const to = q.to ? new Date(q.to) : undefined;
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) to.setHours(23, 59, 59, 999);
    return { from, to };
  }
  const from = new Date(now);
  if (period === 'today') from.setHours(0, 0, 0, 0);
  else if (period === '7d') from.setDate(now.getDate() - 7);
  else if (period === '12m') from.setMonth(now.getMonth() - 12);
  else from.setDate(now.getDate() - 30);
  return { from, to: now };
}

router.get('/costs', async (req: AuthRequest, res: Response) => {
  if (!requireSuperadmin(req, res)) return;
  try {
    const { from, to } = parseCostPeriod(req.query);
    const [costsList, totals] = await Promise.all([
      listCosts({ from, to, category: req.query.category as string, allocation: req.query.allocation as string }),
      costTotals({ from, to }),
    ]);
    res.json({ costs: costsList, totals, categories: COST_CATEGORIES });
  } catch (e) {
    console.error('[COSTS] list error:', e);
    res.status(500).json({ error: 'Erro ao carregar custos' });
  }
});

router.post('/costs', async (req: AuthRequest, res: Response) => {
  if (!requireSuperadmin(req, res)) return;
  try {
    const { description, amount, category, allocation, incurredAt, note } = req.body || {};
    if (!description || !String(description).trim()) return res.status(400).json({ error: 'Descrição obrigatória' });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Valor inválido' });
    const cost = await createCost({
      description: String(description),
      amount: amt,
      category,
      allocation: allocation === 'shared' ? 'shared' : 'company',
      incurredAt: incurredAt ? new Date(incurredAt) : undefined,
      note,
      createdById: req.user!.id,
    });
    res.json({ cost });
  } catch (e) {
    console.error('[COSTS] create error:', e);
    res.status(500).json({ error: 'Erro ao lançar custo' });
  }
});

router.delete('/costs/:id', async (req: AuthRequest, res: Response) => {
  if (!requireSuperadmin(req, res)) return;
  try {
    await deleteCost(req.params.id);
    res.json({ success: true });
  } catch (e) {
    console.error('[COSTS] delete error:', e);
    res.status(500).json({ error: 'Erro ao excluir custo' });
  }
});

router.post('/komunika-test', async (req: AuthRequest, res: Response) => {
  try {
    const { phone, type } = req.body;
    if (!phone || !type) return res.status(400).json({ error: 'Telefone e tipo de teste são obrigatórios' });

    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const apiKey = config?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'Chave da API do Komunika não configurada' });

    const assistantId = type === 'visitor'
      ? (config?.komunikaVisitorAssistantId || process.env.KOMUNIKA_SDR_VISITOR_ASSISTANT_ID)
      : (config?.komunikaCheckoutAssistantId || process.env.KOMUNIKA_SDR_CHECKOUT_ASSISTANT_ID);

    if (!assistantId) {
      return res.status(400).json({ error: `Assistente SDR de ${type === 'visitor' ? 'Visitantes' : 'Recuperação'} não configurado.` });
    }

    // Sample context with mock quiz answers so the test exercises the same
    // SDR context shape the cron/admin re-engage paths produce.
    const context = buildSurveyContext(
      {
        name: 'Teste Admin',
        surveyAnswers: {
          goal: 'Ter uma renda extra de 10.000 a 20.000 MT mensais.',
          pain: 'Não sei programar e acho tecnologia muito complexo.',
          commitment: '1 a 2 horas por dia.',
          awareness: 'Sim, mas não sei por onde começar.',
        },
      },
      {
        scenario: type === 'visitor' ? 'visitor' : 'checkout',
        checkoutUrl: 'https://pay.lojou.app/token/49_Oqg8fBHum',
        orderId: 'TESTE-0001',
      },
    );

    const result = await initiateSdrOutbound({
      assistantId: String(assistantId),
      apiKey,
      phone,
      name: 'Teste Admin',
      context,
      source: type === 'visitor' ? 'landing-abandon' : 'checkout-abandon',
      instanceId: config?.komunikaInstanceId || undefined,
    });

    if (!result.ok) {
      return res.status(result.httpStatus || 502).json({ error: `Komunika retornou erro: ${result.error}`, ok: false, status: result.status });
    }

    res.json({ success: true, ok: true, status: result.status, message: 'Teste SDR disparado com sucesso!', data: result.data });

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
 * GET /api/admin/broadcast/users
 * Searchable user list for hand-picking specific recipients. Supports the
 * same status/date filters so the admin can preview exactly who matches.
 * Query: search, status, period|from|to, limit (default 100, max 500).
 */
router.get('/broadcast/users', async (req: AuthRequest, res: Response) => {
  try {
    const search = (req.query.search as string) || '';
    const status = req.query.status as string;
    const period = req.query.period as string;
    const limit = Math.min(500, Math.max(1, parseInt((req.query.limit as string) || '100', 10)));

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status && status !== 'all') where.subscriptionStatus = status;
    const window = dateWindowFromQuery(period, req.query.from as string, req.query.to as string);
    if (window) where.createdAt = window;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, name: true, email: true, phone: true, subscriptionStatus: true, subscriptionEnd: true },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, total });
  } catch (error) {
    console.error('[BROADCAST] Users error:', error);
    res.status(500).json({ error: 'Erro ao carregar usuários' });
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
 * GET /api/admin/sdr-assistants
 * Lists the Komunika SDR outbound agents so the admin can pick them from a
 * dropdown (instead of pasting an asst_ id). Prefers outbound-mode agents;
 * if the Komunika API doesn't expose a mode, returns all. Returns
 * { assistants: [{ id, name, mode }] } (empty + error on any failure).
 */
router.get('/sdr-assistants', async (_req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const apiKey = config?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

    if (!apiKey) {
      return res.json({ assistants: [], error: 'Chave da API do Komunika não configurada' });
    }

    const response = await fetch(`${apiUrl}/api/v1/sdr-bot/assistants`, {
      headers: { 'X-API-Key': apiKey },
    });

    if (!response.ok) {
      return res.json({ assistants: [], error: `Komunika retornou ${response.status}` });
    }

    const data = await response.json().catch(() => null);
    const rawList =
      data?.data || data?.assistants || data?.agents || (Array.isArray(data) ? data : []);
    const assistants = (Array.isArray(rawList) ? rawList : [])
      .map((a: any) => ({
        id: a.id || a.assistantId || a._id || a.uuid || '',
        name: a.name || a.title || a.label || a.id || '',
        mode: a.mode || a.type || '',
      }))
      .filter((a: { id: string }) => !!a.id)
      // Keep only outbound agents (the only mode `initiate` works with). When
      // the API doesn't expose a mode, keep the agent rather than hide it.
      .filter((a: { mode: string }) => !a.mode || String(a.mode).toLowerCase().includes('outbound'));

    res.json({ assistants });
  } catch (error: any) {
    console.error('[SDR] Assistants list error:', error);
    res.json({ assistants: [], error: error.message });
  }
});

/**
 * POST /api/admin/broadcast/preview
 * Returns preview of message with variables substituted for a sample lead
 */
router.post('/broadcast/preview', async (req: AuthRequest, res: Response) => {
  try {
    const { segment, message, userIds, statuses, createdFrom, createdTo } = req.body;
    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });

    const where = buildAudienceWhere({ segment, userIds, statuses, createdFrom, createdTo });
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
 * Starts a broadcast as a server-side background job and returns its id
 * immediately. The send loop runs detached from this request, so the admin
 * navigating to another tab no longer interrupts it. Progress is read via
 * GET /broadcast/status/:jobId.
 */
router.post('/broadcast/send', async (req: AuthRequest, res: Response) => {
  try {
    const { segment, message, instanceId, delayMin, delayMax, sendPush, generateCoupons, couponDiscount, couponMaxUses, userIds, statuses, createdFrom, createdTo } = req.body;

    if (!message) return res.status(400).json({ error: 'Mensagem obrigatória' });
    if (!instanceId && !sendPush) return res.status(400).json({ error: 'Selecione uma instância WhatsApp ou ative Push Notification' });

    const sendWhatsApp = !!instanceId;

    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const apiKey = config?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

    // Only require API key if actually sending via WhatsApp
    if (sendWhatsApp && !apiKey) return res.status(400).json({ error: 'Chave da API do Komunika não configurada' });

    const where = buildAudienceWhere({ segment, userIds, statuses, createdFrom, createdTo });
    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, surveyAnswers: true },
    });

    if (users.length === 0) return res.status(400).json({ error: 'Nenhum lead encontrado neste segmento' });

    pruneBroadcastJobs();
    const jobId = randomUUID();
    const job: BroadcastJob = {
      id: jobId,
      status: 'running',
      total: users.length,
      sent: 0,
      failed: 0,
      coupons: 0,
      log: [],
      startedAt: Date.now(),
    };
    broadcastJobs.set(jobId, job);

    // Fire-and-forget: the loop survives this request closing / the admin
    // navigating away. We never await it here.
    runBroadcast(job, {
      users, message, instanceId, apiKey, apiUrl, sendWhatsApp,
      delayMin, delayMax, sendPush, generateCoupons, couponDiscount, couponMaxUses,
    }).catch((err: any) => {
      job.status = 'error';
      job.error = err?.message || String(err);
      job.finishedAt = Date.now();
      pushBroadcastEvent(job, { type: 'fatal', error: job.error });
      console.error('[BROADCAST] Job error:', err);
    });

    return res.json({ jobId, total: users.length });
  } catch (error: any) {
    console.error('[BROADCAST] Send error:', error);
    return res.status(500).json({ error: `Erro ao iniciar broadcast: ${error.message}` });
  }
});

/**
 * GET /api/admin/broadcast/status/:jobId
 * Returns the current state of a broadcast job (polled by the frontend).
 */
router.get('/broadcast/status/:jobId', (req: AuthRequest, res: Response) => {
  const job = broadcastJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job não encontrado' });
  return res.json(job);
});

/**
 * GET /api/admin/broadcast/active
 * Returns the most recent running/recent job so reopening the page reattaches
 * to an in-progress broadcast.
 */
router.get('/broadcast/active', (_req: AuthRequest, res: Response) => {
  let latest: BroadcastJob | null = null;
  for (const j of broadcastJobs.values()) {
    if (j.status !== 'running') continue;
    if (!latest || j.startedAt > latest.startedAt) latest = j;
  }
  return res.json({ job: latest });
});

// ── Broadcast background jobs ──
// In-memory store so the send loop is independent of the HTTP/SSE connection.
// (Single backend instance — acceptable for admin broadcasts.)

interface BroadcastEvent { type: string; [key: string]: any }
interface BroadcastJob {
  id: string;
  status: 'running' | 'done' | 'error';
  total: number;
  sent: number;
  failed: number;
  coupons: number;
  log: BroadcastEvent[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

const broadcastJobs = new Map<string, BroadcastJob>();
const MAX_BROADCAST_LOG = 3000;

function pushBroadcastEvent(job: BroadcastJob, ev: BroadcastEvent) {
  job.log.push({ ...ev, total: job.total, sent: job.sent, failed: job.failed, coupons: job.coupons });
  if (job.log.length > MAX_BROADCAST_LOG) job.log.splice(0, job.log.length - MAX_BROADCAST_LOG);
}

// Drop finished jobs older than 2h to keep memory bounded.
function pruneBroadcastJobs() {
  const now = Date.now();
  for (const [id, j] of broadcastJobs) {
    if (j.finishedAt && now - j.finishedAt > 2 * 60 * 60 * 1000) broadcastJobs.delete(id);
  }
}

interface RunBroadcastOpts {
  users: any[];
  message: string;
  instanceId?: string;
  apiKey?: string | null;
  apiUrl: string;
  sendWhatsApp: boolean;
  delayMin: any;
  delayMax: any;
  sendPush: boolean;
  generateCoupons: boolean;
  couponDiscount: any;
  couponMaxUses: any;
}

async function runBroadcast(job: BroadcastJob, opts: RunBroadcastOpts) {
  const { users, message, instanceId, apiKey, apiUrl, sendWhatsApp, sendPush, generateCoupons, couponDiscount, couponMaxUses } = opts;
  const minDelay = Math.max(1, parseInt(opts.delayMin) || 5);
  const maxDelay = Math.max(minDelay, parseInt(opts.delayMax) || 15);

  pushBroadcastEvent(job, { type: 'start' });

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
        job.failed++;
        pushBroadcastEvent(job, { type: 'skip', index: i, name: user.name, reason: 'Telefone inválido' });
        continue;
      }

      let personalizedMsg = substituteVariables(message, user);

      // Generate per-user coupon if enabled
      if (generateCoupons && message.includes('{{cupom}}')) {
        const couponCode = await ensureBroadcastCoupon(job, user, couponDiscount, couponMaxUses);
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
          job.sent++;
          pushBroadcastEvent(job, { type: 'sent', index: i, name: user.name, phone: cleanPhone });
        } else {
          const errBody = await sendRes.text().catch(() => 'Unknown error');
          job.failed++;
          pushBroadcastEvent(job, { type: 'error', index: i, name: user.name, error: errBody });
        }
      } catch (err: any) {
        job.failed++;
        pushBroadcastEvent(job, { type: 'error', index: i, name: user.name, error: err.message });
      }

      // Randomized delay between messages (anti-block)
      if (i < users.length - 1) {
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        pushBroadcastEvent(job, { type: 'waiting', delay, nextIndex: i + 1 });
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
      }
    }
  } else {
    // ── Push-only mode: no WhatsApp loop ──
    job.sent = users.length;
  }

  job.status = 'done';
  job.finishedAt = Date.now();
  pushBroadcastEvent(job, { type: 'complete' });

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
    }, 'promotions').catch(() => {});
  }
}

/**
 * Creates (or reuses) a per-recipient coupon, syncing it to Lojou AND the local
 * coupon table so it behaves exactly like coupons created in the admin panel
 * (visible, trackable, deduplicated). Failures are surfaced in the job log so
 * the admin actually sees why a coupon didn't work instead of failing silently.
 */
async function ensureBroadcastCoupon(job: BroadcastJob, user: any, couponDiscount: any, couponMaxUses: any): Promise<string> {
  const discount = parseInt(couponDiscount) || 10;
  const maxUses = parseInt(couponMaxUses) || 1;
  const code = `CZ${discount}_${user.id.slice(0, 6).toUpperCase()}`;

  // Already created (previous run or earlier iteration) → reuse it.
  const existing = await prisma.coupon.findUnique({ where: { code } }).catch(() => null);
  if (existing) return code;

  let lojouId: string | null = null;
  if (env.LOJOU_API_KEY) {
    try {
      // product_ids is optional: empty → coupon applies to every product.
      const product_ids = env.LOJOU_PRODUCT_ID
        ? [Number.isNaN(Number(env.LOJOU_PRODUCT_ID)) ? env.LOJOU_PRODUCT_ID : Number(env.LOJOU_PRODUCT_ID)]
        : undefined;
      const resp = await lojouService.createDiscount({
        code,
        type: 'percentage',
        value: discount,
        uses_limit: maxUses,
        status: 'active',
        ...(product_ids ? { product_ids } : {}),
      });
      lojouId = LojouService.extractDiscountId(resp);
      console.log(`[BROADCAST] 🎟️ Coupon ${code} created for ${user.email}${lojouId ? ` [Lojou: ${lojouId}]` : ''}`);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes('(409)')) {
        // Exists in Lojou but not locally → fall through and persist locally.
        console.log(`[BROADCAST] ↩ Coupon ${code} already exists in Lojou, reusing for ${user.email}`);
      } else {
        console.warn(`[BROADCAST] Coupon error for ${user.email}:`, msg);
        pushBroadcastEvent(job, { type: 'coupon_error', name: user.name, code, error: msg });
        return code; // still substitute the code; admin can investigate via the log
      }
    }
  } else {
    pushBroadcastEvent(job, { type: 'coupon_error', name: user.name, code, error: 'LOJOU_API_KEY não configurada' });
    return code;
  }

  try {
    await prisma.coupon.create({
      data: {
        code, type: 'percentage', value: discount, maxUses,
        active: true, lojouId, linkedUserId: user.id, linkedUserEmail: user.email,
      },
    });
    job.coupons++;
    pushBroadcastEvent(job, { type: 'coupon', name: user.name, code });
  } catch {
    // Unique-constraint race (created concurrently) — safe to ignore.
  }
  return code;
}

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

/**
 * Turn a period/from/to query into a Prisma date filter `{ gte?, lte? }`.
 * Shared by the leads and users lists so the admin's "Hoje / 7 dias / Mês /
 * Personalizado" chips behave identically everywhere. Returns null when the
 * period is 'all' / unset (no date constraint).
 */
function dateWindowFromQuery(period?: string, from?: string, to?: string): { gte?: Date; lte?: Date } | null {
  const now = new Date();
  if (!period || period === 'all') return null;
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { gte: start };
  }
  if (period === '7d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { gte: start };
  }
  if (period === '30d') {
    const start = new Date(now);
    start.setDate(now.getDate() - 30);
    return { gte: start };
  }
  if (period === 'custom') {
    const win: { gte?: Date; lte?: Date } = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) win.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(to)) d.setHours(23, 59, 59, 999);
        win.lte = d;
      }
    }
    return Object.keys(win).length ? win : null;
  }
  return null;
}

/**
 * Build the audience `where` for a broadcast. Priority: explicit userIds >
 * status list > named segment. Optionally narrows by account creation date.
 */
function buildAudienceWhere(opts: {
  segment?: string;
  userIds?: string[];
  statuses?: string[];
  createdFrom?: string;
  createdTo?: string;
}): any {
  if (opts.userIds && opts.userIds.length > 0) {
    return { id: { in: opts.userIds } };
  }
  const where: any = {};
  if (opts.statuses && opts.statuses.length > 0) {
    where.subscriptionStatus = { in: opts.statuses };
  } else if (opts.segment) {
    Object.assign(where, buildSegmentWhere(opts.segment));
  }
  const created = dateWindowFromQuery('custom', opts.createdFrom, opts.createdTo);
  if (created) where.createdAt = created;
  return where;
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
  // Delegate to the shared sender so milestone/status alerts use the SAME
  // credential resolution as the rest of the app: SystemConfig FIRST, then
  // env.KOMUNIKA_ADMIN_API_KEY as a fallback (+ MZ phone normalization + 3
  // retries). The previous inline version read ONLY from SystemConfig, so if
  // the Komunika key/instance lived in the env (docker-compose) the alert
  // failed silently — which is why Status WhatsApp alerts never arrived.
  const r = await sendWhatsAppMessage({ phone, content: message });
  return r.ok;
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

/**
 * POST /api/admin/platform-test-alert
 * Sends a test WhatsApp to the configured alert phone (or a phone from the
 * body) so the admin can confirm the channel works without waiting for a
 * milestone. Returns the real delivery status instead of failing silently.
 */
router.post('/platform-test-alert', async (req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const phone = (req.body?.phone as string)?.trim() || config?.milestoneAlertPhone;
    if (!phone) {
      return res.status(400).json({ error: 'Nenhum telefone de alerta configurado. Salve o número primeiro.' });
    }
    const name = config?.milestoneAlertName || 'Admin';
    const content = `*Código Zero — Teste de Alerta* ✅\n\nOlá ${name}! Se você recebeu esta mensagem, os alertas por WhatsApp do painel Status estão funcionando.`;
    const r = await sendWhatsAppMessage({ phone, content });
    if (r.ok) return res.json({ success: true, message: 'Mensagem de teste enviada. Confira o WhatsApp.' });
    return res.status(502).json({
      error: `Falha ao enviar (status: ${r.status}). Verifique se a instância Komunika está conectada e a chave configurada.`,
    });
  } catch (error) {
    console.error('[ADMIN] Test alert error:', error);
    return res.status(500).json({ error: 'Erro ao enviar alerta de teste' });
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
    let lojouError: string | null = null;
    if (env.LOJOU_API_KEY) {
      try {
        // product_ids is optional: when empty the coupon applies to every product.
        // Set LOJOU_PRODUCT_ID env var to scope coupons to the Código Zero product.
        const product_ids = env.LOJOU_PRODUCT_ID
          ? [Number.isNaN(Number(env.LOJOU_PRODUCT_ID)) ? env.LOJOU_PRODUCT_ID : Number(env.LOJOU_PRODUCT_ID)]
          : undefined;
        const resp = await lojouService.createDiscount({
          code: upperCode,
          type,
          value: parseFloat(value),
          uses_limit: parseInt(max_uses) || 1,
          status: active !== false ? 'active' : 'inactive',
          ...(product_ids ? { product_ids } : {}),
        });
        lojouId = LojouService.extractDiscountId(resp);
        console.log('[ADMIN] Lojou sync ok:', lojouId);
      } catch (e: any) {
        lojouError = e?.message || 'unknown';
        console.warn('[ADMIN] Lojou sync failed:', lojouError);
      }
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
    return res.json({ coupon, success: true, lojouError });
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

    if (coupon.lojouId && env.LOJOU_API_KEY) {
      try {
        const lojouBody: Record<string, any> = {};
        if (code !== undefined) lojouBody.code = code.toUpperCase().trim();
        if (type !== undefined) lojouBody.type = type;
        if (value !== undefined) lojouBody.value = parseFloat(value);
        if (max_uses !== undefined) lojouBody.uses_limit = parseInt(max_uses);
        if (active !== undefined) lojouBody.status = active ? 'active' : 'inactive';
        await lojouService.updateDiscount(coupon.lojouId, lojouBody);
      } catch (e: any) {
        console.warn(`[ADMIN] Lojou updateDiscount failed for ${coupon.code}:`, e?.message || e);
      }
    }

    const updated = await prisma.coupon.update({ where: { id: req.params.id }, data });
    return res.json({ coupon: updated, success: true });
  } catch { return res.status(500).json({ error: 'Erro ao atualizar cupom' }); }
});

router.delete('/cupons/:id', async (req: AuthRequest, res: Response) => {
  try {
    const coupon = await prisma.coupon.findUnique({ where: { id: req.params.id } });
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });

    if (coupon.lojouId && env.LOJOU_API_KEY) {
      try {
        await lojouService.deleteDiscount(coupon.lojouId);
      } catch (e: any) {
        console.warn(`[ADMIN] Lojou deleteDiscount failed for ${coupon.code}:`, e?.message || e);
      }
    }

    await prisma.coupon.delete({ where: { id: req.params.id } });
    console.log(`[ADMIN] 🗑️ Coupon deleted: ${coupon.code}`);
    return res.json({ success: true });
  } catch { return res.status(500).json({ error: 'Erro ao excluir cupom' }); }
});

/**
 * Default WhatsApp message sent with a coupon. The recipient form
 * decides which placeholders are available — but the template uses
 * the same tokens regardless, so admins can pick freely.
 *
 * Placeholders: {{nome}}, {{cupom}}, {{link}}, {{desconto}}
 */
const DEFAULT_COUPON_MESSAGE = [
  'Olá {{nome}}! 🎉',
  '',
  'Tenho um presente para você entrar no Código Zero:',
  '',
  '🎟️ *Cupom:* {{cupom}}  ({{desconto}})',
  '',
  'O link já abre o checkout com o cupom aplicado — basta confirmar:',
  '🔗 {{link}}',
  '',
  '🚀 Aproveite — esse cupom é só seu.',
].join('\n');

/**
 * Generate a pre-filled checkout URL on Lojou with the coupon attached.
 * Falls back to the public product page (?coupon=...) when the order
 * API is unavailable or rejects — the buyer can still enter the cupom
 * by hand in that case.
 */
async function buildCheckoutUrlWithCoupon(opts: {
  name: string;
  email: string;
  phone: string;
  couponCode: string;
}): Promise<string> {
  const fallbackPublic = `https://pay.lojou.app/p/${env.LOJOU_PRODUCT_PID}?coupon=${encodeURIComponent(opts.couponCode)}`;
  if (!env.LOJOU_API_KEY) return fallbackPublic;
  try {
    const order = await lojouService.createOrder({
      amount: await getActivePrice(),
      product_pid: env.LOJOU_PRODUCT_PID,
      plan_id: env.LOJOU_PLAN_ID,
      coupon_code: opts.couponCode,
      customer: {
        name: opts.name,
        email: opts.email,
        mobile_number: opts.phone,
      },
    });
    return order?.checkout_url || fallbackPublic;
  } catch (e: any) {
    console.warn('[ADMIN] coupon checkout createOrder failed, using public fallback:', e?.message || e);
    return fallbackPublic;
  }
}

/**
 * POST /api/admin/cupons/send
 *
 * Body — recipient is one of:
 *   { recipient: { type: 'user',   userId: string } }
 *   { recipient: { type: 'lead',   leadId: string } }
 *   { recipient: { type: 'manual', name, phone, email? } }
 *
 * Plus:
 *   couponCode: string  (required)
 *   message?:   string  (optional; defaults to DEFAULT_COUPON_MESSAGE)
 *
 * The endpoint:
 *   1. Resolves the recipient → { name, email, phone }
 *   2. Generates a Lojou checkout link prefilled with that customer
 *      and the coupon applied (so brand-new leads can subscribe with
 *      one tap).
 *   3. Substitutes {{nome}}, {{cupom}}, {{link}}, {{desconto}} in the
 *      message body.
 *   4. Sends via Komunika WhatsApp.
 */
router.post('/cupons/send', async (req: AuthRequest, res: Response) => {
  try {
    const { couponCode, recipient, message } = req.body || {};
    if (!couponCode) return res.status(400).json({ error: 'Cupom obrigatório' });
    if (!recipient || typeof recipient !== 'object') {
      return res.status(400).json({ error: 'Recipient inválido' });
    }

    // 1. Confirm coupon exists in our DB (also lets us format the discount label)
    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase().trim() } });
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado no sistema' });
    const discountLabel =
      coupon.type === 'percentage' || coupon.type === 'percent' || coupon.type === '%'
        ? `${coupon.value}% OFF`
        : `${coupon.value} MZN OFF`;

    // 2. Resolve recipient → { name, email, phone, linkedUserId? }
    let name = '';
    let email = '';
    let phone = '';
    let linkedUserId: string | null = null;

    if (recipient.type === 'user') {
      if (!recipient.userId) return res.status(400).json({ error: 'userId obrigatório' });
      const u = await prisma.user.findUnique({ where: { id: recipient.userId } });
      if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
      name = u.name || '';
      email = u.email || '';
      phone = u.phone || '';
      linkedUserId = u.id;
    } else if (recipient.type === 'lead') {
      if (!recipient.leadId) return res.status(400).json({ error: 'leadId obrigatório' });
      // Leads are stored on the User table with subscriptionStatus='lead'
      const lead = await prisma.user.findUnique({ where: { id: recipient.leadId } });
      if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });
      name = lead.name || '';
      email = lead.email || '';
      phone = lead.phone || '';
      linkedUserId = lead.id;
    } else if (recipient.type === 'manual') {
      if (!recipient.name || !recipient.phone) {
        return res.status(400).json({ error: 'Nome e telefone obrigatórios em envio manual' });
      }
      name = String(recipient.name).trim();
      phone = String(recipient.phone).trim();
      email = recipient.email ? String(recipient.email).trim() : `${phone.replace(/\D/g, '')}@manual.czero`;
    } else {
      return res.status(400).json({ error: `Tipo de recipient desconhecido: ${recipient.type}` });
    }

    if (!phone) return res.status(400).json({ error: 'Recipient sem telefone' });

    // 3. Link the coupon to the recipient when possible (auditing)
    if (linkedUserId) {
      const u = await prisma.user.findUnique({ where: { id: linkedUserId }, select: { email: true } });
      await prisma.coupon.update({
        where: { id: coupon.id },
        data: { linkedUserId, linkedUserEmail: u?.email || email || null },
      });
    }

    // 4. Generate prefilled checkout link
    const checkoutUrl = await buildCheckoutUrlWithCoupon({ name, email, phone, couponCode: coupon.code });

    // 5. Substitute placeholders in the message
    const firstName = (name || 'membro').split(' ')[0];
    const finalMessage = (message || DEFAULT_COUPON_MESSAGE)
      .replace(/\{\{\s*nome\s*\}\}/gi, firstName)
      .replace(/\{\{\s*cupom\s*\}\}/gi, coupon.code)
      .replace(/\{\{\s*link\s*\}\}/gi, checkoutUrl)
      .replace(/\{\{\s*desconto\s*\}\}/gi, discountLabel);

    // 6. Send via Komunika
    const sent = await sendKomunika(phone, finalMessage);
    if (!sent) {
      return res.status(502).json({
        error: 'Falha ao enviar via WhatsApp — verifique configuração Komunika',
        checkoutUrl,
        previewMessage: finalMessage,
      });
    }
    return res.json({
      success: true,
      sentTo: { name, phone, email, type: recipient.type },
      checkoutUrl,
      previewMessage: finalMessage,
    });
  } catch (error: any) {
    console.error('[ADMIN] Send coupon error:', error);
    return res.status(500).json({ error: error?.message || 'Erro ao enviar cupom' });
  }
});

/**
 * POST /api/admin/cupons/preview
 *
 * Same recipient resolution as /send, but only returns the rendered
 * message + checkout URL without dispatching the WhatsApp. Used by the
 * admin modal to show a live preview before the user clicks send.
 */
router.post('/cupons/preview', async (req: AuthRequest, res: Response) => {
  try {
    const { couponCode, recipient, message } = req.body || {};
    if (!couponCode || !recipient) return res.status(400).json({ error: 'couponCode e recipient obrigatórios' });

    const coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase().trim() } });
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });
    const discountLabel =
      coupon.type === 'percentage' || coupon.type === 'percent' || coupon.type === '%'
        ? `${coupon.value}% OFF`
        : `${coupon.value} MZN OFF`;

    let name = '';
    let phone = '';
    let email = '';
    if (recipient.type === 'user' || recipient.type === 'lead') {
      const id = recipient.userId || recipient.leadId;
      if (!id) return res.status(400).json({ error: 'id obrigatório' });
      const u = await prisma.user.findUnique({ where: { id } });
      if (!u) return res.status(404).json({ error: 'Não encontrado' });
      name = u.name || '';
      phone = u.phone || '';
      email = u.email || '';
    } else if (recipient.type === 'manual') {
      name = String(recipient.name || '').trim();
      phone = String(recipient.phone || '').trim();
      email = recipient.email ? String(recipient.email).trim() : '';
    }

    // Preview does NOT call Lojou — keeps the modal snappy and avoids
    // creating throwaway pending orders. Returns the public fallback
    // link so the admin can see roughly what will be in the message.
    const previewLink = `https://pay.lojou.app/p/${env.LOJOU_PRODUCT_PID}?coupon=${encodeURIComponent(coupon.code)}`;
    const firstName = (name || 'membro').split(' ')[0];
    const finalMessage = (message || DEFAULT_COUPON_MESSAGE)
      .replace(/\{\{\s*nome\s*\}\}/gi, firstName)
      .replace(/\{\{\s*cupom\s*\}\}/gi, coupon.code)
      .replace(/\{\{\s*link\s*\}\}/gi, previewLink)
      .replace(/\{\{\s*desconto\s*\}\}/gi, discountLabel);

    return res.json({
      message: finalMessage,
      previewLink,
      recipient: { name, phone, email, type: recipient.type },
      defaultTemplate: DEFAULT_COUPON_MESSAGE,
    });
  } catch (error: any) {
    console.error('[ADMIN] Preview coupon error:', error);
    return res.status(500).json({ error: error?.message || 'Erro no preview' });
  }
});

// ═══════════════════════════════════════
// AFFILIATE PROGRAM — ADMIN
// ═══════════════════════════════════════

/**
 * GET /api/admin/affiliates
 * Returns every affiliate account with rollup stats (referrals, commissions,
 * withdrawals).
 */
router.get('/affiliates', async (_req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.affiliateAccount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    const ids = accounts.map((a) => a.id);
    const [referralCounts, commissionAggs, withdrawalAggs] = await Promise.all([
      prisma.affiliateReferral.groupBy({
        by: ['affiliateId', 'status'],
        where: { affiliateId: { in: ids } },
        _count: true,
      }),
      prisma.affiliateCommission.groupBy({
        by: ['affiliateId', 'status'],
        where: { affiliateId: { in: ids } },
        _sum: { netAmount: true },
        _count: true,
      }),
      prisma.affiliateWithdrawal.groupBy({
        by: ['affiliateId', 'status'],
        where: { affiliateId: { in: ids } },
        _sum: { amountNet: true, amountRequested: true },
        _count: true,
      }),
    ]);

    const byAff = <T extends { affiliateId: string }>(rows: T[]) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const list = m.get(r.affiliateId) ?? [];
        list.push(r);
        m.set(r.affiliateId, list);
      }
      return m;
    };
    const refMap = byAff(referralCounts);
    const commMap = byAff(commissionAggs);
    const wdMap = byAff(withdrawalAggs);

    const affiliates = accounts.map((a) => {
      const refs = refMap.get(a.id) ?? [];
      const comms = commMap.get(a.id) ?? [];
      const wds = wdMap.get(a.id) ?? [];
      const paidReferrals = refs.find((r) => r.status === 'paid')?._count ?? 0;
      const lostReferrals =
        (refs.find((r) => r.status === 'lost_to_remarketing')?._count ?? 0) +
        (refs.find((r) => r.status === 'refunded')?._count ?? 0);
      const pendingComm = comms.find((c) => c.status === 'pending')?._sum.netAmount ?? 0;
      const availableComm = comms.find((c) => c.status === 'available')?._sum.netAmount ?? 0;
      const withdrawnComm = comms.find((c) => c.status === 'withdrawn')?._sum.netAmount ?? 0;
      const paidOut =
        wds.find((w) => w.status === 'paid')?._sum.amountNet ?? 0;

      return {
        id: a.id,
        code: a.code,
        enabled: a.enabled,
        createdAt: a.createdAt,
        user: a.user,
        payoutMethod: a.payoutMethod,
        payoutTarget: a.payoutTarget,
        stats: {
          paidReferrals,
          lostReferrals,
          pendingCommission: pendingComm,
          availableCommission: availableComm,
          withdrawnCommission: withdrawnComm,
          totalPaidOut: paidOut,
        },
      };
    });

    return res.json({ affiliates });
  } catch (error) {
    console.error('[ADMIN] affiliates list error:', error);
    return res.status(500).json({ error: 'Erro ao carregar afiliados' });
  }
});

/**
 * GET /api/admin/affiliates/:id — detail with referrals + commissions + withdrawals
 */
router.get('/affiliates/:id', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.affiliateAccount.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        referrals: {
          orderBy: { createdAt: 'desc' },
          take: 200,
          include: { user: { select: { name: true, email: true } } },
        },
        commissions: { orderBy: { createdAt: 'desc' }, take: 200 },
        withdrawals: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!account) return res.status(404).json({ error: 'Afiliado não encontrado' });
    return res.json({ account });
  } catch (error) {
    console.error('[ADMIN] affiliate detail error:', error);
    return res.status(500).json({ error: 'Erro ao carregar afiliado' });
  }
});

/**
 * PATCH /api/admin/affiliates/:id — toggle enable/disable
 */
router.patch('/affiliates/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled deve ser booleano' });
    }
    const updated = await prisma.affiliateAccount.update({
      where: { id: req.params.id },
      data: { enabled },
    });
    return res.json({ success: true, account: updated });
  } catch (error) {
    console.error('[ADMIN] affiliate toggle error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar afiliado' });
  }
});

/**
 * GET /api/admin/affiliate-withdrawals
 * Returns withdrawals queue. Filters: status=pending|paid|rejected (default all).
 */
router.get('/affiliate-withdrawals', async (req: AuthRequest, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const rows = await prisma.affiliateWithdrawal.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        affiliate: {
          select: {
            code: true,
            user: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
      },
    });
    return res.json({ withdrawals: rows });
  } catch (error) {
    console.error('[ADMIN] withdrawals list error:', error);
    return res.status(500).json({ error: 'Erro ao carregar saques' });
  }
});

/**
 * POST /api/admin/affiliate-withdrawals/:id/approve — mark paid
 */
router.post('/affiliate-withdrawals/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { notes } = req.body;
    const wd = await prisma.affiliateWithdrawal.findUnique({
      where: { id: req.params.id },
      include: { affiliate: { include: { user: { select: { id: true, name: true } } } } },
    });
    if (!wd) return res.status(404).json({ error: 'Saque não encontrado' });
    if (wd.status !== 'pending') {
      return res.status(400).json({ error: `Saque já está '${wd.status}'` });
    }
    const updated = await markWithdrawalPaid(wd.id, req.user!.id, notes);

    sendPushToUser(wd.affiliate.user.id, {
      title: '💰 Saque aprovado',
      body: `${updated.amountNet} MZN foram pagos via ${updated.payoutMethod}.`,
      url: '/afiliacao',
    }).catch(() => {});

    return res.json({ success: true, withdrawal: updated });
  } catch (error) {
    console.error('[ADMIN] withdrawal approve error:', error);
    return res.status(500).json({ error: 'Erro ao aprovar saque' });
  }
});

/**
 * POST /api/admin/affiliate-withdrawals/:id/reject
 * Releases the held commissions back to the affiliate's available balance.
 */
router.post('/affiliate-withdrawals/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { notes } = req.body;
    const wd = await prisma.affiliateWithdrawal.findUnique({
      where: { id: req.params.id },
      include: { affiliate: { include: { user: { select: { id: true } } } } },
    });
    if (!wd) return res.status(404).json({ error: 'Saque não encontrado' });
    if (wd.status !== 'pending') {
      return res.status(400).json({ error: `Saque já está '${wd.status}'` });
    }
    const updated = await rejectWithdrawal(wd.id, req.user!.id, notes);

    sendPushToUser(wd.affiliate.user.id, {
      title: '↩️ Saque devolvido',
      body: `Seu saque de ${wd.amountRequested} MZN foi rejeitado e o saldo retornou.`,
      url: '/afiliacao',
    }).catch(() => {});

    return res.json({ success: true, withdrawal: updated });
  } catch (error) {
    console.error('[ADMIN] withdrawal reject error:', error);
    return res.status(500).json({ error: 'Erro ao rejeitar saque' });
  }
});

// ═══════════════════════════════════════
// PUSH TEST — simulate the "new sale" notification superadmins receive
// when a real order.approved webhook fires. Does NOT touch the database
// (no fake user, no fake transaction) — purely a notification dry-run.
// ═══════════════════════════════════════

const CLOSE_FRIENDS_BUMP_PRICE_DEFAULT = 1297;

async function dispatchSalePushTest(opts: { withBump: boolean; customerName?: string }) {
  const principal = await getActivePrice();
  const bumpPrice = opts.withBump
    ? Number(process.env.LOJOU_CLOSE_FRIENDS_PRICE || CLOSE_FRIENDS_BUMP_PRICE_DEFAULT)
    : 0;
  const total = principal + bumpPrice;
  const customerName = opts.customerName || 'Teste Compra';
  const productName = 'Código Zero';
  const currency = 'MZN';
  const payMethodLabel = 'M-Pesa';
  const amountFmt = new Intl.NumberFormat('pt-MZ', { minimumFractionDigits: 0 }).format(total);
  const bumpLabel = opts.withBump ? ' 🥂 Close Friends' : '';

  // Mirror the exact shape used in the webhook handler so what admins see
  // here is what they'll see on a real sale.
  return sendPushToSuperAdmins({
    title: '🧪 (Teste) 💰 Nova Venda!',
    body: `${customerName} — ${productName}${bumpLabel}\n${amountFmt} ${currency} via ${payMethodLabel}`,
    url: '/admin/finance',
  });
}

router.post('/push-test/sale', async (req: AuthRequest, res: Response) => {
  try {
    const result = await dispatchSalePushTest({ withBump: false, customerName: req.body?.customerName });
    return res.json({ success: result.delivered > 0, withBump: false, ...result });
  } catch (e: any) {
    console.error('[ADMIN] push-test/sale error:', e);
    return res.status(500).json({ error: e?.message || 'Falha ao enviar push de teste' });
  }
});

router.post('/push-test/sale-with-bump', async (req: AuthRequest, res: Response) => {
  try {
    const result = await dispatchSalePushTest({ withBump: true, customerName: req.body?.customerName });
    return res.json({ success: result.delivered > 0, withBump: true, ...result });
  } catch (e: any) {
    console.error('[ADMIN] push-test/sale-with-bump error:', e);
    return res.status(500).json({ error: e?.message || 'Falha ao enviar push de teste' });
  }
});

// ═══════════════════════════════════════
// CSV EXPORTS (leads / users / finance)
// ═══════════════════════════════════════
//
// Each export reuses the SAME filters the matching list endpoint accepts so
// the downloaded file mirrors exactly what the admin sees on screen. Auth is
// already enforced by the router-level authMiddleware + adminMiddleware above.

// RFC-4180-ish CSV escaping: wrap a field in quotes and double any embedded
// quote. Values containing commas, quotes or newlines MUST be quoted so Excel
// keeps them in a single cell. We quote everything for simplicity/safety.
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let s: string;
  if (value instanceof Date) {
    s = Number.isNaN(value.getTime()) ? '' : value.toISOString();
  } else if (typeof value === 'boolean') {
    s = value ? 'Sim' : 'Não';
  } else {
    s = String(value);
  }
  return `"${s.replace(/"/g, '""')}"`;
}

// Build a CSV body from a header row + data rows. Prepends a UTF-8 BOM so
// Excel renders acentos (ã, ç, …) correctly instead of mojibake.
function buildCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // \r\n line endings are the safest for Excel across platforms.
  return '﻿' + lines.join('\r\n');
}

// Sends a string as a downloadable .csv attachment with a dated filename.
function sendCsv(res: Response, baseName: string, csv: string): void {
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}-${stamp}.csv"`);
  res.send(csv);
}

// NOTE: /leads/export and /users/export are registered EARLIER in this file —
// they must be declared BEFORE the '/leads/:id' and '/users/:id' routes, or
// Express would match those and treat "export" as an :id (404). Only the
// finance export lives here because there's no '/finance/:id' to shadow it.

// GET /api/admin/finance/export — exports the transaction list using the SAME
// window + search + source + txType + txStatus filters as GET /api/admin/finance.
router.get('/finance/export', async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || '30d';
    const search = ((req.query.search as string) || '').trim();
    const source = ((req.query.source as string) || 'all').trim();
    const txType = ((req.query.txType as string) || 'all').trim();
    const txStatus = ((req.query.txStatus as string) || 'all').trim();

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
      if (!from || !to) {
        return res.status(400).json({ error: 'period=custom requer from e to em ISO' });
      }
      startDate = new Date(from);
      endDate = new Date(to);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'datas inválidas (ISO esperado)' });
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) endDate.setHours(23, 59, 59, 999);
    } else {
      startDate.setDate(now.getDate() - 30);
    }

    const searchClause = search
      ? {
          OR: [
            { userName: { contains: search, mode: 'insensitive' as const } },
            { userEmail: { contains: search, mode: 'insensitive' as const } },
            { userPhone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const sourceClause =
      source === 'principal'
        ? { coproducerId: null }
        : source && source !== 'all'
          ? { coproducerId: source }
          : {};
    const typeClause =
      txType === 'new'
        ? { isRenewal: false }
        : txType === 'renewal'
          ? { isRenewal: true }
          : txType === 'closeFriends'
            ? { isCloseFriends: true }
            : {};
    const statusClause = txStatus && txStatus !== 'all' ? { status: txStatus } : {};

    const transactions = await prisma.transaction.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
        ...searchClause,
        ...sourceClause,
        ...typeClause,
        ...statusClause,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        userName: true,
        userEmail: true,
        userPhone: true,
        isRenewal: true,
        isCloseFriends: true,
        paymentMethod: true,
        gateway: true,
        grossAmount: true,
        amount: true,
        lojouFee: true,
        coproducerFee: true,
        orderBumpAmount: true,
        status: true,
        orderId: true,
        coproducer: { select: { displayName: true, user: { select: { name: true } } } },
      },
    });

    const headers = [
      'Data', 'Cliente', 'Email', 'Telefone', 'Tipo', 'Close Friends', 'Origem',
      'Método', 'Gateway', 'Bruto', 'Bump', 'Taxa Lojou', 'Split coprodutor',
      'Líquido', 'Status', 'Order ID',
    ];
    const rows = transactions.map((t) => [
      t.createdAt,
      t.userName,
      t.userEmail,
      t.userPhone,
      t.isRenewal ? 'Renovação' : 'Nova',
      t.isCloseFriends,
      t.coproducer ? (t.coproducer.displayName || t.coproducer.user?.name || 'Coprodutor') : 'Principal',
      t.paymentMethod,
      t.gateway,
      t.grossAmount ?? t.amount,
      t.orderBumpAmount,
      t.lojouFee,
      t.coproducerFee,
      t.amount,
      t.status,
      t.orderId,
    ]);
    sendCsv(res, 'financeiro', buildCsv(headers, rows));
  } catch (error) {
    console.error('[ADMIN] Finance export error:', error);
    res.status(500).json({ error: 'Erro ao exportar transações' });
  }
});

export default router;

