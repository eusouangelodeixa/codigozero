import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

declare module './auth.middleware' {
  interface AuthRequest {
    partner?: {
      id: string;
      sharePct: number;
      enabled: boolean;
      withdrawOnly: boolean;
      displayName: string | null;
      payoutMethod: string | null;
      payoutTarget: string | null;
    };
  }
}

/**
 * Partner-only middleware — must run AFTER authMiddleware.
 *
 * Gates on owning an enabled PartnerAccount. Deliberately does NOT check the
 * User.role: a sócio may also be admin/superadmin (Ângelo, Emen) or a plain
 * account (Rival, Leonel). There is no subscription gate either — partners
 * are staff, not subscribers.
 */
export const partnerMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    const account = await prisma.partnerAccount.findUnique({
      where: { userId: req.user.id },
    });

    if (!account) {
      return res.status(403).json({ error: 'Conta de sócio não encontrada' });
    }
    // Allow when the account is enabled OR in withdraw-only mode. An offboarded
    // sócio has enabled=false (out of the commission pool) but withdrawOnly=true
    // so they can still reach ONLY their own saque screen to cash out.
    if (!account.enabled && !account.withdrawOnly) {
      return res.status(403).json({ error: 'Conta de sócio desativada' });
    }

    req.partner = {
      id: account.id,
      sharePct: account.sharePct,
      enabled: account.enabled,
      withdrawOnly: account.withdrawOnly,
      displayName: account.displayName,
      payoutMethod: account.payoutMethod,
      payoutTarget: account.payoutTarget,
    };
    next();
  } catch {
    return res.status(500).json({ error: 'Erro de autorização' });
  }
};
