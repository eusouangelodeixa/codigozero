import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';

const router = Router();
const prisma = new PrismaClient();

// GET /api/qg/info
router.get('/info', authMiddleware, subscriptionMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    let config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });

    if (!config) {
      config = await prisma.systemConfig.create({
        data: {
          id: 'singleton',
          communityLink: 'https://discord.gg/codigozero',
          mentoriaSchedule: null,
          mentoriaLink: null,
        },
      });
    }

    return res.json({
      community: {
        platform: 'Discord',
        link: config.communityLink || 'https://discord.gg/codigozero',
      },
      mentoria: {
        nextSession: config.mentoriaSchedule,
        link: config.mentoriaLink,
      },
      stats: {
        currentUsers: config.currentUsers,
        maxUsers: config.maxUsers,
      },
    });
  } catch (error) {
    console.error('[QG] Info error:', error);
    return res.status(500).json({ error: 'Erro ao carregar informações do QG' });
  }
});

export default router;
