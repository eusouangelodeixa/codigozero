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
    situation: sa.situation || '',
    goal: sa.goal || '',
    driver: sa.driver || '',
    objection: sa.objection || '',
    experience: sa.experience || '',
    budget: sa.budget || '',
    urgency: sa.urgency || '',
    checkout_url: user?.renewalUrl || user?.checkoutUrl || '',
    ...extra,
  };
}

/**
 * Build the free-text SDR `context` injected into the Komunika assistant's LLM
 * prompt. Unlike buildSurveyCustomFields (structured key/value for funnels),
 * this produces a single Portuguese paragraph describing the lead and the
 * abandonment scenario so the SDR agent can open a natural conversation.
 *
 * Omits any line whose underlying value is empty, never invents data, and caps
 * the result at 1800 chars (the API limit is ~2000).
 */
export function buildSurveyContext(
  user: LifecycleUser | null | undefined,
  opts: { scenario: 'visitor' | 'checkout'; checkoutUrl?: string; orderId?: string },
): string {
  const sa = (user?.surveyAnswers as Record<string, string> | null) || {};
  const situation = (sa.situation || '').trim();
  const goal = (sa.goal || '').trim();
  const driver = (sa.driver || '').trim();
  const objection = (sa.objection || '').trim();
  const experience = (sa.experience || '').trim();
  const budget = (sa.budget || '').trim();
  const urgency = (sa.urgency || '').trim();
  const name = (user?.name || '').trim();
  const checkoutUrl = (opts.checkoutUrl || '').trim();
  const orderId = (opts.orderId || '').trim();

  const lines: string[] = [];

  if (opts.scenario === 'visitor') {
    lines.push(
      name
        ? `Lead ${name} preencheu o quiz de diagnóstico na landing page do Código Zero (497 MT/mês) mas NÃO concluiu a compra.`
        : `Lead preencheu o quiz de diagnóstico na landing page do Código Zero (497 MT/mês) mas NÃO concluiu a compra.`,
    );
    if (situation) lines.push(`Situação atual: «${situation}».`);
    if (goal) lines.push(`Meta financeira (6 meses): «${goal}».`);
    if (driver) lines.push(`O que mais o move: «${driver}».`);
    if (objection) lines.push(`PRINCIPAL OBJEÇÃO a tratar primeiro: «${objection}».`);
    if (experience) lines.push(`Experiência prévia: «${experience}».`);
    if (budget) lines.push(`Disposição de investimento: «${budget}».`);
    if (urgency) lines.push(`Urgência declarada: «${urgency}».`);
    if (checkoutUrl) lines.push(`Link de pagamento: ${checkoutUrl}.`);
  } else {
    lines.push(
      name
        ? `Lead ${name} chegou ao checkout do Código Zero e iniciou o pagamento${orderId ? ` (ordem ${orderId})` : ''} mas NÃO concluiu.`
        : `Lead chegou ao checkout do Código Zero e iniciou o pagamento${orderId ? ` (ordem ${orderId})` : ''} mas NÃO concluiu.`,
    );
    lines.push(
      'Trate como alguém que já decidiu comprar — ajude a remover o obstáculo, não refaça o pitch.',
    );
    if (situation) lines.push(`Situação atual: «${situation}».`);
    if (goal) lines.push(`Meta financeira (6 meses): «${goal}».`);
    if (driver) lines.push(`O que mais o move: «${driver}».`);
    if (objection) lines.push(`PRINCIPAL OBJEÇÃO a tratar primeiro: «${objection}».`);
    if (experience) lines.push(`Experiência prévia: «${experience}».`);
    if (budget) lines.push(`Disposição de investimento: «${budget}».`);
    if (urgency) lines.push(`Urgência declarada: «${urgency}».`);
    if (checkoutUrl) lines.push(`Link de recuperação: ${checkoutUrl}.`);
  }

  const out = lines.join(' ');
  return out.length > 1800 ? out.slice(0, 1800) : out;
}

/** Cancellation confirmation — same text used by the in-app cancel flow. */
export async function sendCancellationMessage(user: LifecycleUser | null | undefined) {
  if (!user?.phone) return { ok: false, status: 'no-phone' as const };
  const content = `Olá ${firstName(user.name)}, sua assinatura do *Código Zero* foi cancelada com sucesso.\n\nSentimos sua falta! 😔\n\nSe quiser voltar a qualquer momento, é só renovar pelo link na plataforma.\n\nObrigado por ter feito parte da comunidade! 🤝`;
  return sendWhatsAppMessage({ phone: user.phone, content });
}
