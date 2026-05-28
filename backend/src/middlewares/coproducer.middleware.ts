import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

declare module './auth.middleware' {
  interface AuthRequest {
    coproducer?: {
      id: string;
      code: string;
      productPid: string;
      sharePct: number;
      enabled: boolean;
    };
  }
}

/**
 * Coproducer-only middleware — must run AFTER authMiddleware.
 *
 * Validates the caller has role='coproducer' AND owns an enabled
 * CoproducerAccount. Attaches the account to req.coproducer so
 * downstream handlers can filter by it.
 */
export const coproducerMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { role: true, coproducerAccount: true },
    });

    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });
    if (user.role !== 'coproducer') {
      return res.status(403).json({ error: 'Acesso restrito a coprodutores' });
    }
    if (!user.coproducerAccount) {
      return res.status(403).json({ error: 'Conta de coprodução não configurada' });
    }
    if (!user.coproducerAccount.enabled) {
      return res.status(403).json({ error: 'Conta de coprodução desativada' });
    }

    req.coproducer = {
      id: user.coproducerAccount.id,
      code: user.coproducerAccount.code,
      productPid: user.coproducerAccount.productPid,
      sharePct: user.coproducerAccount.sharePct,
      enabled: user.coproducerAccount.enabled,
    };
    next();
  } catch {
    return res.status(500).json({ error: 'Erro de autorização' });
  }
};
