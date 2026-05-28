import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * Middleware that blocks access for users with expired subscriptions.
 * Users in 'active' status pass through. All others get blocked.
 *
 * EXCEPTION: admin + coproducer roles bypass the check entirely. They
 * don't consume the member subscription (don't access /forja, /radar
 * etc.), so a `subscriptionStatus='lead'` on a coprodutor account is
 * normal — coproducers are typically promoted from a lead/member row
 * without ever having paid. Blocking them sent legit coprodutoras
 * (Vânia) to /blocked when they tried to open the dashboard.
 */
export const subscriptionMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const { subscriptionStatus, role } = req.user;

  // Roles that don't need a member subscription
  if (role === 'admin' || role === 'coproducer') {
    return next();
  }

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
