import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Superadmin-only middleware — must be used AFTER authMiddleware.
 *
 * Endpoints that create/modify coproducer accounts (and any other
 * highly-privileged action) gate on this. Plain `admin` is not
 * enough — only `superadmin` can promote/demote coproducers, since
 * that controls revenue attribution.
 */
export const superadminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true },
    });
    if (!user || user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Acesso restrito ao superadmin' });
    }
    next();
  } catch {
    return res.status(500).json({ error: 'Erro de autorização' });
  }
};
