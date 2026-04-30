import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Admin middleware — must be used AFTER authMiddleware.
 * Checks that the authenticated user has role 'admin' or 'superadmin'.
 */
export const adminMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true },
    });

    if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Erro de autorização' });
  }
};
