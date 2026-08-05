import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import { env } from '../config/env';
import { getVerseOfTheDay } from '../services/verse.service';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// GET /api/dashboard/metrics
router.get('/metrics', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Count total leads extracted. The Radar worker writes ScrapedLead rows
    // (linked to the user via ScrapeJob), NOT the legacy `Lead` table — so we
    // count through the job relation. Counting `Lead` here was the bug that
    // kept the dashboard stuck on 0 even after extracting hundreds of leads.
    const totalLeads = await prisma.scrapedLead.count({
      where: { job: { userId } },
    });

    // Prospecting campaigns (scrape jobs) the user has run.
    const totalCampaigns = await prisma.scrapeJob.count({
      where: { userId, archived: false },
    });

    // Messages actually delivered through the Disparador.
    const messagesSent = await prisma.dispatchLog.count({
      where: { userId, status: 'sent' },
    });

    // Count completed lessons
    const completedLessons = await prisma.lessonProgress.count({
      where: { userId, completed: true },
    });

    // Count total lessons
    const totalLessons = await prisma.lesson.count();

    // Progress percentage
    const progressPercentage = totalLessons > 0
      ? Math.round((completedLessons / totalLessons) * 100)
      : 0;

    // Progresso POR CURSO (área de membros) — alimenta as barras do card
    // "Cursos" no dashboard do aluno.
    const publishedCourses = await prisma.course.findMany({
      where: { status: 'published' },
      orderBy: { sortOrder: 'asc' },
      select: { slug: true, name: true, modules: { select: { lessons: { select: { id: true } } } } },
    });
    // Uma linha de progresso (concluída OU apenas visualizada) marca o curso
    // como "iniciado" — alimenta o KPI "Cursos iniciados" do dashboard.
    const progressRows = await prisma.lessonProgress.findMany({
      where: { userId },
      select: { lessonId: true, completed: true, lastViewedAt: true },
    });
    const doneSet = new Set(progressRows.filter((r) => r.completed).map((r) => r.lessonId));
    const touchedSet = new Set(progressRows.filter((r) => r.completed || r.lastViewedAt).map((r) => r.lessonId));
    const courses = publishedCourses.map((c) => {
      const ids = c.modules.flatMap((m) => m.lessons.map((l) => l.id));
      const done = ids.filter((lid) => doneSet.has(lid)).length;
      return {
        slug: c.slug,
        name: c.name,
        totalLessons: ids.length,
        completedLessons: done,
        pct: ids.length ? Math.round((done / ids.length) * 100) : 0,
        started: ids.some((lid) => touchedSet.has(lid)),
      };
    });

    // Banners rotativos configurados em /admin/config (máx. 5).
    const sysConfig = await prisma.systemConfig.findFirst({
      where: { id: 'singleton' },
      select: { dashboardBanners: true },
    });
    const banners = Array.isArray(sysConfig?.dashboardBanners)
      ? (sysConfig!.dashboardBanners as any[]).filter((b) => b && typeof b.imageUrl === 'string' && b.imageUrl)
      : [];

    // Get user info for subscription
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
        dailySearchCount: true,
        lastSearchDate: true,
      },
    });

    return res.json({
      metrics: {
        totalLeads,
        totalCampaigns,
        messagesSent,
        completedLessons,
        totalLessons,
        progressPercentage,
        searchesRemaining: getRemainingSearches(user),
        dailySearchLimit: env.MAX_DAILY_SEARCHES,
      },
      courses,
      banners,
      user: {
        name: user?.name,
        subscriptionStatus: user?.subscriptionStatus,
        subscriptionEnd: user?.subscriptionEnd,
      },
    });
  } catch (error) {
    console.error('[DASHBOARD] Metrics error:', error);
    return res.status(500).json({ error: 'Erro ao carregar métricas' });
  }
});

// GET /api/dashboard/verse-of-the-day — daily Bible verse (rotates daily,
// Sabbath-aware). Auth only (no subscription gate) so it always renders.
router.get('/verse-of-the-day', authMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const verse = await getVerseOfTheDay();
    return res.json({ verse });
  } catch (error) {
    console.error('[DASHBOARD] Verse error:', error);
    return res.status(500).json({ error: 'Erro ao carregar versículo' });
  }
});

function getRemainingSearches(user: any): number {
  const limit = env.MAX_DAILY_SEARCHES;
  if (!user) return limit;
  const today = new Date().toDateString();
  const lastSearch = user.lastSearchDate ? new Date(user.lastSearchDate).toDateString() : null;

  if (lastSearch !== today) return limit;
  return Math.max(0, limit - (user.dailySearchCount || 0));
}

export default router;
