import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { buildKomunikaSsoUrl } from '../services/komunika.service';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

// SSO links are short-lived JWTs minted server-side. Rate-limit so a stolen
// session can't farm a pile of valid tokens to replay.
const ssoLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações. Tente novamente em alguns minutos.' },
});

/**
 * GET /api/komunika/sso-link?return_to=/dashboard
 * Returns a ready-to-open SSO URL for the embedded Komunika module.
 *  - 404 if the user never provisioned a tenant
 *  - 403 if the tenant was deprovisioned (access suspended)
 * The JWT secret never leaves the server.
 */
router.get('/sso-link', authMiddleware, ssoLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        komunikaCompanyId: true,
        komunikaDeprovisionedAt: true,
      },
    });

    if (!user || !user.komunikaCompanyId) {
      return res.status(404).json({ error: 'Komunika não provisionado para esta conta.' });
    }
    if (user.komunikaDeprovisionedAt) {
      return res.status(403).json({ error: 'Acesso ao Komunika suspenso.' });
    }
    if (!env.KOMUNIKA_SSO_JWT_SECRET) {
      // Provisioning can be on (HMAC secret) while the SSO secret is missing —
      // surface that distinctly instead of a generic 500.
      console.error('[KOMUNIKA] SSO requested but KOMUNIKA_SSO_JWT_SECRET not configured');
      return res.status(503).json({ error: 'Integração Komunika indisponível no momento.' });
    }

    // Only allow same-origin relative paths: a single leading '/' NOT followed
    // by '/' or '\' — rejects protocol-relative //evil.com and /\evil.com.
    const raw = typeof req.query.return_to === 'string' ? req.query.return_to : '';
    const returnTo = /^\/(?![/\\])/.test(raw) ? raw : '/dashboard';

    const url = buildKomunikaSsoUrl({ id: user.id, email: user.email, name: user.name }, returnTo);
    return res.json({ url });
  } catch (error) {
    console.error('[KOMUNIKA] sso-link error:', error);
    return res.status(500).json({ error: 'Erro ao gerar link de acesso.' });
  }
});

export default router;
