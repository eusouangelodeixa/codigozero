import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';

const router = Router();
const prisma = new PrismaClient();

// GET /api/dashboard/metrics
router.get('/metrics', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Count total leads extracted
    const totalLeads = await prisma.lead.count({ where: { userId } });

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
        completedLessons,
        totalLessons,
        progressPercentage,
        searchesRemaining: getRemainingSearches(user),
      },
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

function getRemainingSearches(user: any): number {
  if (!user) return 10;
  const today = new Date().toDateString();
  const lastSearch = user.lastSearchDate ? new Date(user.lastSearchDate).toDateString() : null;

  if (lastSearch !== today) return 10;
  return Math.max(0, 10 - (user.dailySearchCount || 0));
}

export default router;
