import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Blocks an offboarded "withdraw-only" sócio from every member feature.
 *
 * Must run AFTER authMiddleware (needs req.user). A user whose PartnerAccount
 * has withdrawOnly=true may use ONLY /api/partner/* (their own saque) and
 * /api/auth/me|logout — every other API surface 403s here. This is
 * defense-in-depth on top of the role demotion (admin→member, which already
 * removes /api/admin and the ability to approve their own withdrawal).
 *
 * On any lookup error it fails OPEN (next()) so a transient DB blip never locks
 * out legitimate members — the security boundary that actually matters (admin)
 * is enforced by the role, not by this guard.
 */
export const blockWithdrawOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return next(); // unauthenticated → let the route's own auth answer
    const acct = await prisma.partnerAccount.findUnique({
      where: { userId: req.user.id },
      select: { withdrawOnly: true },
    });
    if (acct?.withdrawOnly) {
      return res.status(403).json({ error: 'Acesso restrito: sua conta está limitada a solicitar o saque.' });
    }
    return next();
  } catch {
    return next();
  }
};
