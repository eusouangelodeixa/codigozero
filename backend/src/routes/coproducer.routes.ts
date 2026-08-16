import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { coproducerMiddleware } from '../middlewares/coproducer.middleware';
import { notifyCoproducer } from '../services/coproducer.service';
import { resolveWindow, InvalidPeriodError } from '../lib/period';
import { sendPushToSuperAdmins } from '../services/push.service';
import { logAdminEvent } from '../services/adminEvents.service';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

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
      vslEmbedHtml: acc.vslEmbedHtml,
      headScripts: acc.headScripts,
    });
  } catch (error) {
    console.error('[COPRODUCER] /me error:', error);
    res.status(500).json({ error: 'Erro ao carregar conta' });
  }
});

/**
 * PATCH /api/coproducer/me/scripts
 *
 * The coproducer can edit their own tracking pixels (Meta Pixel, GA,
 * TikTok etc.) — injected into <head> on their /c/{code} landing.
 *
 * VSL is intentionally NOT editable here — only the superadmin sets
 * the VSL embed so a coproducer can't replace it with random content.
 *
 * Hard cap at 8 KB to keep the HTML reasonable (a full pixel suite is
 * usually <2 KB; 8 KB is plenty of slack without enabling abuse).
 */
router.patch('/me/scripts', async (req: AuthRequest, res: Response) => {
  try {
    const { headScripts } = req.body || {};
    const raw = typeof headScripts === 'string' ? headScripts : '';
    if (raw.length > 8000) {
      return res.status(400).json({ error: 'Scripts excedem o limite de 8 KB' });
    }
    const updated = await prisma.coproducerAccount.update({
      where: { id: req.coproducer!.id },
      data: { headScripts: raw.trim() || null },
      select: { headScripts: true },
    });
    res.json({ success: true, headScripts: updated.headScripts });
  } catch (error) {
    console.error('[COPRODUCER] /me/scripts error:', error);
    res.status(500).json({ error: 'Erro ao salvar scripts' });
  }
});

/**
 * GET /api/coproducer/notifications/prefs
 * Returns the 4 toggle states. Used by /coproducer/notifications.
 */
router.get('/notifications/prefs', async (req: AuthRequest, res: Response) => {
  try {
    const acc = await prisma.coproducerAccount.findUnique({
      where: { id: req.coproducer!.id },
      select: {
        notifySale: true,
        notifyRenewal: true,
        notifyLead: true,
        notifyCredentialFail: true,
      },
    });
    if (!acc) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json({ prefs: acc });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar preferências' });
  }
});

/**
 * PATCH /api/coproducer/notifications/prefs
 * Body: any subset of { notifySale, notifyRenewal, notifyLead, notifyCredentialFail }
 */
router.patch('/notifications/prefs', async (req: AuthRequest, res: Response) => {
  try {
    const { notifySale, notifyRenewal, notifyLead, notifyCredentialFail } = req.body || {};
    const updated = await prisma.coproducerAccount.update({
      where: { id: req.coproducer!.id },
      data: {
        ...(typeof notifySale === 'boolean' ? { notifySale } : {}),
        ...(typeof notifyRenewal === 'boolean' ? { notifyRenewal } : {}),
        ...(typeof notifyLead === 'boolean' ? { notifyLead } : {}),
        ...(typeof notifyCredentialFail === 'boolean' ? { notifyCredentialFail } : {}),
      },
      select: {
        notifySale: true,
        notifyRenewal: true,
        notifyLead: true,
        notifyCredentialFail: true,
      },
    });
    res.json({ prefs: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar preferências' });
  }
});

/**
 * GET /api/coproducer/notifications/history?limit=50
 * Reverse-chronological list of pushes (or attempts) targeted at this
 * coproducer's user. Includes both delivered and skipped (toggle-off)
 * entries — by design, so the coproducer can audit what they missed.
 */
router.get('/notifications/history', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(200, Math.max(5, parseInt((req.query.limit as string) || '50', 10)));
    const items = await prisma.notificationLog.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, type: true, title: true, body: true, url: true, delivered: true, createdAt: true },
    });
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

/**
 * POST /api/coproducer/notifications/test
 * Sends a test push to the caller. Bypasses the per-type toggle on
 * purpose — this is the button the coproducer clicks to confirm their
 * browser is properly subscribed.
 */
router.post('/notifications/test', async (req: AuthRequest, res: Response) => {
  try {
    const delivered = await notifyCoproducer({
      coproducerId: req.coproducer!.id,
      type: 'test',
      title: '🔔 Notificação de teste',
      body: 'Está tudo certo — você vai receber notificações de vendas, leads, renovações e falhas aqui.',
      url: '/coproducer/notifications',
    });
    res.json({ delivered });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar teste' });
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
    // Calendar-aligned (CAT) window + buckets — identical semantics to
    // /admin/finance, so the two screens always agree. See lib/period.ts.
    const win = resolveWindow({
      period,
      from: req.query.from as string,
      to: req.query.to as string,
      now,
    });
    const { startDate, endDate, previousStartDate: prevStart, previousEndDate: prevEnd } = win;

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

    // Chart — pre-zero-filled buckets; unexpected keys get a slot instead of
    // being dropped (a dropped sale shows up as total ≠ plotted sum).
    const chartMap = new Map<string, { new: number; renewal: number }>();
    win.buckets.forEach((k) => chartMap.set(k, { new: 0, renewal: 0 }));
    current.forEach((t) => {
      const k = win.bucketOf(new Date(t.createdAt));
      let s = chartMap.get(k);
      if (!s) {
        s = { new: 0, renewal: 0 };
        chartMap.set(k, s);
      }
      if (t.isRenewal) s.renewal += t.amount; else s.new += t.amount;
    });
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
    if (error instanceof InvalidPeriodError) {
      return res.status(400).json({ error: error.message });
    }
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
 * Every user attributed to this coproducer, EXCEPT pure leads
 * (subscriptionStatus='lead' lives on /leads). Includes active,
 * expired, cancelled, overdue, grace_period — so the coproducer
 * sees churned/inactive customers too.
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

// ═══════════════════════════════════════════════════════════════════════════
// CURSOS DO COPRODUTOR (área de membros)
//
// Um coprodutor pode estar associado a cursos (Course.coproducerId). Aqui ele
// vê alunos + faturamento de CADA curso dele e pode matricular alunos — cada
// matrícula avisa os superadmins (push) e entra no feed de Atividade do admin.
// O acerto financeiro da coprodução é feito por fora; nada disto passa pelo
// rateio de sócios.
// ═══════════════════════════════════════════════════════════════════════════

/** Garante que o curso pertence a este coprodutor. */
async function ownCourse(coproducerId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, coproducerId },
    select: { id: true, name: true, slug: true, status: true, coverUrl: true, accessType: true },
  });
  return course;
}

/**
 * GET /api/coproducer/courses
 * Cursos associados a esta coprodução, cada um com nº de alunos e faturamento.
 */
router.get('/courses', async (req: AuthRequest, res: Response) => {
  try {
    const courses = await prisma.course.findMany({
      where: { coproducerId: req.coproducer!.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, status: true, coverUrl: true, accessType: true, checkoutUrl: true },
    });
    // Métricas de TODOS os cursos em 2 groupBy — não 2 queries por curso.
    const ids = courses.map((c) => c.id);
    const [studentCounts, revenueAgg] = ids.length
      ? await Promise.all([
          prisma.courseAccess.groupBy({ by: ['courseId'], where: { courseId: { in: ids } }, _count: true }),
          prisma.transaction.groupBy({
            by: ['courseId'],
            where: { courseId: { in: ids }, status: 'approved' },
            _sum: { amount: true },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const studentsBy = new Map(studentCounts.map((s: any) => [s.courseId, s._count]));
    const revenueBy = new Map(revenueAgg.map((r: any) => [r.courseId, r]));
    const out = courses.map((c) => ({
      ...c,
      students: studentsBy.get(c.id) ?? 0,
      sales: revenueBy.get(c.id)?._count?._all ?? 0,
      revenue: revenueBy.get(c.id)?._sum?.amount ?? 0,
      yourSharePct: req.coproducer!.sharePct,
    }));
    res.json({ courses: out });
  } catch (error) {
    console.error('[COPRODUCER] /courses error:', error);
    res.status(500).json({ error: 'Erro ao carregar cursos' });
  }
});

/**
 * GET /api/coproducer/courses/:id/students?page=1
 * Alunos do curso (só cursos deste coprodutor), mais recentes primeiro.
 */
router.get('/courses/:id/students', async (req: AuthRequest, res: Response) => {
  try {
    const course = await ownCourse(req.coproducer!.id, String(req.params.id));
    if (!course) return res.status(404).json({ error: 'Curso não encontrado' });

    const page = Math.max(1, parseInt(String(req.query.page || '1')) || 1);
    const perPage = 25;
    const [total, rows] = await Promise.all([
      prisma.courseAccess.count({ where: { courseId: course.id } }),
      prisma.courseAccess.findMany({
        where: { courseId: course.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          source: true,
          expiresAt: true,
          createdAt: true,
          user: { select: { name: true, email: true, phone: true } },
        },
      }),
    ]);
    res.json({
      course: { id: course.id, name: course.name },
      total,
      page,
      perPage,
      students: rows.map((r) => ({
        id: r.id,
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
        source: r.source,
        lifetime: r.expiresAt === null,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error('[COPRODUCER] /courses/:id/students error:', error);
    res.status(500).json({ error: 'Erro ao carregar alunos' });
  }
});

/**
 * POST /api/coproducer/courses/:id/students  { name, email?, phone? }
 * Matricula UM aluno no curso (vitalício, sem acesso à plataforma além do
 * curso). Credenciais saem pela fila citando o nome do curso. Cada adição
 * gera push aos superadmins + linha no feed de Atividade do admin — o
 * coprodutor adiciona, mas o dono fica sempre sabendo.
 */
router.post('/courses/:id/students', async (req: AuthRequest, res: Response) => {
  try {
    const course = await ownCourse(req.coproducer!.id, String(req.params.id));
    if (!course) return res.status(404).json({ error: 'Curso não encontrado' });

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    if (!email && !phone) return res.status(400).json({ error: 'Informe e-mail ou telefone do aluno' });

    const { bulkEnroll } = await import('../services/bulkEnroll.service');
    const result = await bulkEnroll({
      entries: [{ name: name || 'Aluno', email, phone }],
      platformDays: 0, // só o curso — plataforma é outra compra
      courseId: course.id,
      courseExpiresAt: null, // vitalício (decisão de produto)
      grantedById: req.user!.id,
      batch: `copro-${req.coproducer!.code}`,
      courseSource: 'coproducer',
    });
    if (result.skipped.length) {
      return res.status(400).json({ error: result.skipped[0]?.reason || 'Não foi possível matricular' });
    }

    const acct = await prisma.coproducerAccount.findUnique({
      where: { id: req.coproducer!.id },
      select: { displayName: true, user: { select: { name: true } } },
    });
    const coproName = acct?.displayName || acct?.user?.name || req.coproducer!.code;
    const alunoLabel = name || email || phone;
    void sendPushToSuperAdmins({
      title: '👤 Coprodutor matriculou aluno',
      body: `${coproName} adicionou ${alunoLabel} em "${course.name}"`,
      url: '/admin/atividade',
    });
    void logAdminEvent({
      type: 'copro_enroll',
      title: `Matrícula por coprodutor: ${course.name}`,
      body: `${coproName} adicionou ${alunoLabel} (${email || phone}) em "${course.name}"`,
      meta: { courseId: course.id, coproducerId: req.coproducer!.id, email, phone },
    });

    res.json({ success: true, created: result.created, reused: result.reused });
  } catch (error) {
    console.error('[COPRODUCER] add student error:', error);
    res.status(500).json({ error: 'Erro ao matricular aluno' });
  }
});

export default router;
