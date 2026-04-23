import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Middleware that enforces the 50-user hard limit.
 * Used only on the signup/webhook endpoint to prevent new registrations.
 */
export const scarcityMiddleware = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });

    if (!config) {
      config = await prisma.systemConfig.create({
        data: { id: 'singleton', maxUsers: 50, currentUsers: 0 },
      });
    }

    if (config.currentUsers >= config.maxUsers) {
      return res.status(403).json({
        error: 'Vagas esgotadas',
        message: `Todas as ${config.maxUsers} vagas da Turma 1 foram preenchidas.`,
        currentUsers: config.currentUsers,
        maxUsers: config.maxUsers,
      });
    }

    next();
  } catch (error) {
    console.error('[SCARCITY] Error checking user count:', error);
    next(); // fail open — don't block webhooks on DB errors
  }
};
