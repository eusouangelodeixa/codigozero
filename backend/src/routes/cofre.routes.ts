import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';

const router = Router();
const prisma = new PrismaClient();

// GET /api/cofre/scripts
router.get('/scripts', authMiddleware, subscriptionMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const scripts = await prisma.script.findMany({
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });

    // Group by category
    const grouped = scripts.reduce((acc: Record<string, any[]>, script) => {
      if (!acc[script.category]) acc[script.category] = [];
      acc[script.category].push(script);
      return acc;
    }, {});

    return res.json({ scripts: grouped });
  } catch (error) {
    console.error('[COFRE] Scripts error:', error);
    return res.status(500).json({ error: 'Erro ao carregar scripts' });
  }
});

// GET /api/cofre/scripts/:id
router.get('/scripts/:id', authMiddleware, subscriptionMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const script = await prisma.script.findUnique({
      where: { id: req.params.id },
    });

    if (!script) {
      return res.status(404).json({ error: 'Script não encontrado' });
    }

    return res.json({ script });
  } catch (error) {
    console.error('[COFRE] Script detail error:', error);
    return res.status(500).json({ error: 'Erro ao carregar script' });
  }
});

export default router;
