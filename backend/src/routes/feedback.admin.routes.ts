/**
 * Admin API for the post-purchase feedback dashboard (/admin/feedback).
 *
 * GET  /               → KPIs (funnel, per-question stats, CSAT, trend, channels)
 * GET  /suggestions    → paginated suggestion inbox (read/unread)
 * PATCH /suggestions/:id/read → toggle read flag
 * GET  /responses      → recent answered responses
 * POST /force-enroll   → (superadmin) create/reset a survey with near dueAts — E2E testing
 * POST /resend-link    → (superadmin) mint + email a fresh /pesquisa link
 *
 * Mounted at /api/admin/feedback (server.ts). Windows via resolveWindow —
 * the house rule for KPI endpoints (CAT-aligned buckets).
 */
import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { adminMiddleware } from '../middlewares/admin.middleware';
import { superadminMiddleware } from '../middlewares/superadmin.middleware';
import { pageArgs, paginated } from '../lib/pagination';
import { resolveWindow, InvalidPeriodError } from '../lib/period';
import { FEEDBACK_OPTIONS, FEEDBACK_QUESTIONS } from '../lib/feedbackQuestions';
import { adminResendLink, forceEnroll } from '../services/feedback.service';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

router.use(authMiddleware);
router.use(adminMiddleware);

// GET /api/admin/feedback?period=30d|7d|12m|custom&from&to
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    let window;
    try {
      window = resolveWindow({
        period: req.query.period as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
    } catch (e) {
      if (e instanceof InvalidPeriodError) return res.status(400).json({ error: e.message });
      throw e;
    }
    const { startDate, endDate } = window;
    const inWindow = { gte: startDate, lte: endDate };

    const [
      enrolled,
      sentSurveys,
      completed,
      answeredResponses,
      suggestionsInWindow,
      unreadSuggestions,
      channelSurveys,
    ] = await Promise.all([
      prisma.feedbackSurvey.count({
        where: { createdAt: inWindow, feedbackStatus: { not: 'skipped' } },
      }),
      // "sent" = the session actually reached the user (first poll or email).
      prisma.feedbackSurvey.findMany({
        where: {
          OR: [{ feedbackStartedAt: inWindow }, { emailSentAt: inWindow }],
        },
        select: {
          id: true,
          channel: true,
          responses: { where: { answeredAt: { not: null } }, select: { id: true }, take: 1 },
        },
      }),
      prisma.feedbackSurvey.count({ where: { feedbackCompletedAt: inWindow } }),
      prisma.feedbackResponse.findMany({
        where: { answeredAt: inWindow },
        select: { questionKey: true, score: true, answeredAt: true, channel: true },
      }),
      prisma.feedbackSuggestion.count({ where: { createdAt: inWindow } }),
      prisma.feedbackSuggestion.count({ where: { isRead: false } }),
      prisma.feedbackSurvey.groupBy({
        by: ['channel'],
        where: { channel: { not: null }, OR: [{ feedbackStartedAt: inWindow }, { emailSentAt: inWindow }] },
        _count: { _all: true },
      }),
    ]);

    const sent = sentSurveys.length;
    const started = sentSurveys.filter((s) => s.responses.length > 0).length;

    // Per-question stats + overall CSAT from the answered responses.
    const perQuestion = FEEDBACK_QUESTIONS.map((q) => {
      const rows = answeredResponses.filter((r) => r.questionKey === q.key && r.score != null);
      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      let sum = 0;
      for (const r of rows) {
        distribution[r.score!] = (distribution[r.score!] || 0) + 1;
        sum += r.score!;
      }
      const count = rows.length;
      const positive = (distribution[3] || 0) + (distribution[4] || 0);
      return {
        key: q.key,
        label: q.label,
        text: q.text,
        count,
        avgScore: count ? +(sum / count).toFixed(2) : null,
        csatPct: count ? +((positive / count) * 100).toFixed(1) : null,
        distribution,
      };
    });

    const scored = answeredResponses.filter((r) => r.score != null);
    const totalAnswered = scored.length;
    const totalPositive = scored.filter((r) => r.score! >= 3).length;
    const avgScore = totalAnswered
      ? +(scored.reduce((a, r) => a + r.score!, 0) / totalAnswered).toFixed(2)
      : null;

    // Trend: answered responses per bucket (count + avg score).
    const byBucket = new Map<string, { count: number; sum: number }>();
    for (const key of window.buckets) byBucket.set(key, { count: 0, sum: 0 });
    for (const r of scored) {
      const key = window.bucketOf(r.answeredAt!);
      const b = byBucket.get(key);
      if (b) {
        b.count += 1;
        b.sum += r.score!;
      }
    }
    const trend = window.buckets.map((key) => {
      const b = byBucket.get(key)!;
      return {
        bucket: key,
        responses: b.count,
        avgScore: b.count ? +(b.sum / b.count).toFixed(2) : null,
      };
    });

    const channelSplit = {
      surveys: Object.fromEntries(channelSurveys.map((c) => [c.channel, c._count._all])),
      responses: {
        whatsapp: scored.filter((r) => r.channel === 'whatsapp').length,
        web: scored.filter((r) => r.channel === 'web').length,
      },
    };

    return res.json({
      window: { period: window.period, granularity: window.granularity },
      options: FEEDBACK_OPTIONS,
      funnel: {
        enrolled,
        sent,
        started,
        completed,
        responseRate: sent ? +((completed / sent) * 100).toFixed(1) : null,
      },
      csatPct: totalAnswered ? +((totalPositive / totalAnswered) * 100).toFixed(1) : null,
      avgScore,
      totalAnswered,
      perQuestion,
      trend,
      channelSplit,
      suggestions: { inWindow: suggestionsInWindow, unread: unreadSuggestions },
    });
  } catch (error) {
    console.error('[ADMIN-FEEDBACK] GET / failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar métricas de feedback' });
  }
});

// GET /api/admin/feedback/suggestions?page&pageSize&unread=1
router.get('/suggestions', async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = req.query.unread === '1' ? { isRead: false } : {};
    const [rows, total] = await Promise.all([
      prisma.feedbackSuggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          survey: { select: { user: { select: { id: true, name: true, email: true, phone: true } } } },
        },
      }),
      prisma.feedbackSuggestion.count({ where }),
    ]);
    const items = rows.map((r) => ({
      id: r.id,
      content: r.content,
      channel: r.channel,
      isRead: r.isRead,
      createdAt: r.createdAt,
      user: r.survey.user,
    }));
    return res.json(paginated(items, total, page, pageSize));
  } catch (error) {
    console.error('[ADMIN-FEEDBACK] GET /suggestions failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar sugestões' });
  }
});

// PATCH /api/admin/feedback/suggestions/:id/read { isRead }
router.patch('/suggestions/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const isRead = req.body?.isRead !== false;
    const updated = await prisma.feedbackSuggestion.update({
      where: { id: String(req.params.id) },
      data: { isRead },
      select: { id: true, isRead: true },
    });
    return res.json({ success: true, suggestion: updated });
  } catch {
    return res.status(404).json({ error: 'Sugestão não encontrada' });
  }
});

// GET /api/admin/feedback/responses?page&pageSize — recent answered responses
router.get('/responses', async (req: AuthRequest, res: Response) => {
  try {
    const { page, pageSize, skip, take } = pageArgs(req);
    const where = { answeredAt: { not: null } };
    const [rows, total] = await Promise.all([
      prisma.feedbackResponse.findMany({
        where,
        orderBy: { answeredAt: 'desc' },
        skip,
        take,
        include: {
          survey: { select: { user: { select: { id: true, name: true, email: true } } } },
        },
      }),
      prisma.feedbackResponse.count({ where }),
    ]);
    const labels = Object.fromEntries(FEEDBACK_QUESTIONS.map((q) => [q.key, q.label]));
    const items = rows.map((r) => ({
      id: r.id,
      questionKey: r.questionKey,
      questionLabel: labels[r.questionKey] || r.questionKey,
      optionText: r.optionText,
      score: r.score,
      channel: r.channel,
      answeredAt: r.answeredAt,
      user: r.survey.user,
    }));
    return res.json(paginated(items, total, page, pageSize));
  } catch (error) {
    console.error('[ADMIN-FEEDBACK] GET /responses failed:', error);
    return res.status(500).json({ error: 'Erro ao carregar respostas' });
  }
});

// POST /api/admin/feedback/force-enroll { userId, feedbackDueInMinutes?, suggestionDueInMinutes? }
// Superadmin test/ops tool: bypasses the 45d window and the stagger, RESETS
// any previous survey state for the user.
router.post('/force-enroll', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.body?.userId || '');
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
    const result = await forceEnroll({
      userId,
      feedbackDueInMinutes: Number.isFinite(+req.body?.feedbackDueInMinutes)
        ? +req.body.feedbackDueInMinutes
        : undefined,
      suggestionDueInMinutes: Number.isFinite(+req.body?.suggestionDueInMinutes)
        ? +req.body.suggestionDueInMinutes
        : undefined,
    });
    return res.json({ success: true, ...result });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao forçar inscrição' });
  }
});

// POST /api/admin/feedback/resend-link { userId } — mints + emails a fresh web
// link; the URL comes back in the response so the admin can copy it directly.
router.post('/resend-link', superadminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.body?.userId || '');
    if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });
    const result = await adminResendLink(userId);
    return res.json({ success: true, ...result });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || 'Erro ao reenviar link' });
  }
});

export default router;
