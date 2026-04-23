import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';

const router = Router();
const prisma = new PrismaClient();

// GET /api/forja/modules
router.get('/modules', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const modules = await prisma.module.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        lessons: {
          orderBy: { sortOrder: 'asc' },
          include: {
            progress: {
              where: { userId },
              select: { completed: true, completedAt: true },
            },
          },
        },
      },
    });

    // Transform to add user progress info
    const modulesWithProgress = modules.map(mod => ({
      ...mod,
      totalLessons: mod.lessons.length,
      completedLessons: mod.lessons.filter(l => l.progress.some(p => p.completed)).length,
      lessons: mod.lessons.map(lesson => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        duration: lesson.duration,
        tools: lesson.tools,
        completed: lesson.progress.some(p => p.completed),
        completedAt: lesson.progress.find(p => p.completed)?.completedAt || null,
      })),
    }));

    return res.json({ modules: modulesWithProgress });
  } catch (error) {
    console.error('[FORJA] Modules error:', error);
    return res.status(500).json({ error: 'Erro ao carregar módulos' });
  }
});

// POST /api/forja/progress
router.post('/progress', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { lessonId, completed } = req.body;

    if (!lessonId || typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'lessonId e completed são obrigatórios' });
    }

    // Verify lesson exists
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      return res.status(404).json({ error: 'Aula não encontrada' });
    }

    // Upsert progress
    const progress = await prisma.lessonProgress.upsert({
      where: {
        userId_lessonId: { userId, lessonId },
      },
      update: {
        completed,
        completedAt: completed ? new Date() : null,
      },
      create: {
        userId,
        lessonId,
        completed,
        completedAt: completed ? new Date() : null,
      },
    });

    return res.json({ progress });
  } catch (error) {
    console.error('[FORJA] Progress error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar progresso' });
  }
});

// GET /api/forja/progress
router.get('/progress', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const progress = await prisma.lessonProgress.findMany({
      where: { userId, completed: true },
      select: { lessonId: true, completedAt: true },
    });

    const totalLessons = await prisma.lesson.count();
    const completedCount = progress.length;

    return res.json({
      completedLessons: progress,
      totalLessons,
      completedCount,
      percentage: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
    });
  } catch (error) {
    console.error('[FORJA] Progress list error:', error);
    return res.status(500).json({ error: 'Erro ao carregar progresso' });
  }
});

export default router;
