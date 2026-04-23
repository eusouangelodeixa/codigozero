import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * Middleware that blocks access for users with expired subscriptions.
 * Users in 'active' status pass through. All others get blocked.
 */
export const subscriptionMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { subscriptionStatus } = req.user;

  if (subscriptionStatus === 'active') {
    return next();
  }

  if (subscriptionStatus === 'grace_period') {
    // Allow access but warn
    res.setHeader('X-Subscription-Warning', 'grace_period');
    return next();
  }

  // overdue or canceled — block access
  return res.status(403).json({
    error: 'Assinatura inativa',
    subscriptionStatus,
    message: subscriptionStatus === 'overdue'
      ? 'Sua assinatura está vencida. Renove para continuar acessando a plataforma.'
      : 'Sua assinatura foi cancelada. Assine novamente para ter acesso.',
  });
};
