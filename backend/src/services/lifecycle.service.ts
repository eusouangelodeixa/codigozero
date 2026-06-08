import { sendWhatsAppMessage } from '../lib/whatsapp';

/**
 * Shared customer-lifecycle messaging, so Lojou and Stripe behave identically.
 * All sends go through `sendWhatsAppMessage`, which uses the SYSTEM Komunika
 * admin credentials and silently no-ops when Komunika isn't reachable.
 */

type LifecycleUser = {
  name?: string | null;
  phone?: string | null;
  surveyAnswers?: unknown;
  renewalUrl?: string | null;
  checkoutUrl?: string | null;
};

const firstName = (name?: string | null) => (name || 'membro').split(' ')[0];

/**
 * Build the Komunika `customFields` payload from a user's quiz answers, so a
 * funnel can personalize the recovery sequence (goal/pain/commitment/awareness).
 */
export function buildSurveyCustomFields(
  user: LifecycleUser | null | undefined,
  extra: Record<string, string> = {},
): Record<string, string> {
  const sa = (user?.surveyAnswers as Record<string, string> | null) || {};
  return {
    nome: user?.name || '',
    goal: sa.goal || '',
    pain: sa.pain || '',
    commitment: sa.commitment || '',
    awareness: sa.awareness || '',
    checkout_url: user?.renewalUrl || user?.checkoutUrl || '',
    ...extra,
  };
}

/** Cancellation confirmation — same text used by the in-app cancel flow. */
export async function sendCancellationMessage(user: LifecycleUser | null | undefined) {
  if (!user?.phone) return { ok: false, status: 'no-phone' as const };
  const content = `Olá ${firstName(user.name)}, sua assinatura do *Código Zero* foi cancelada com sucesso.\n\nSentimos sua falta! 😔\n\nSe quiser voltar a qualquer momento, é só renovar pelo link na plataforma.\n\nObrigado por ter feito parte da comunidade! 🤝`;
  return sendWhatsAppMessage({ phone: user.phone, content });
}
