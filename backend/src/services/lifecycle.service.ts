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

/**
 * FALLBACK de remarketing (SEM OpenAI). Quando o SDR AI da Komunika não está
 * entregando (ex.: OpenAI sem crédito → a conversa é criada mas nenhuma
 * mensagem sai), o Código Zero envia DIRETO esta mensagem-modelo pronta —
 * personalizada por lead a partir das respostas do quiz — para a operação não
 * parar. É texto de WhatsApp puro (não passa por LLM): muda de lead para lead
 * pelo nome + respostas (meta, objeção, situação), sem depender de IA.
 */
export function buildFallbackMessage(
  user: LifecycleUser | null | undefined,
  opts: { scenario: 'visitor' | 'checkout'; checkoutUrl?: string },
): string {
  const sa = (user?.surveyAnswers as Record<string, string> | null) || {};
  const first = (user?.name || '').trim().split(' ')[0];
  const goal = (sa.goal || '').trim();
  const objection = (sa.objection || '').trim();
  const driver = (sa.driver || '').trim();
  const situation = (sa.situation || '').trim();
  const checkoutUrl = (opts.checkoutUrl || '').trim();
  const hi = first ? `Olá, ${first}! 👋` : 'Olá! 👋';
  const L: string[] = [hi, ''];

  if (opts.scenario === 'checkout') {
    L.push('Aqui é da equipe do *Código Zero*. Vi que você começou a assinatura mas o pagamento não foi concluído — quis te dar uma força pra não perder a vaga. 🙌');
    if (goal) L.push('', `Você marcou como meta *${goal}* — dá pra começar a construir isso agora mesmo.`);
    else if (driver) L.push('', `Lembrei do que você disse que te move: *${driver}*.`);
    if (checkoutUrl) L.push('', 'É só finalizar por aqui (leva 1 minuto):', checkoutUrl);
  } else {
    L.push('Aqui é da equipe do *Código Zero*. Vi que você fez o diagnóstico na nossa página mas ainda não entrou — quis te chamar pessoalmente. 🙌');
    if (goal) L.push('', `Você colocou como meta *${goal}*. O Código Zero foi feito exatamente pra te levar até aí, passo a passo.`);
    else if (situation) L.push('', `Pela sua situação (*${situation}*), acredito que faça muito sentido pra você.`);
    if (objection) L.push('', `Se o que te segurou foi *${objection.toLowerCase()}*, me responde aqui que eu te ajudo a resolver.`);
    if (checkoutUrl) L.push('', 'Se quiser começar agora (497 MT/mês):', checkoutUrl);
  }
  L.push('', 'Qualquer dúvida, é só responder aqui. 🚀');
  return L.join('\n');
}

/** Cancellation confirmation — same text used by the in-app cancel flow. */
export async function sendCancellationMessage(user: LifecycleUser | null | undefined) {
  if (!user?.phone) return { ok: false, status: 'no-phone' as const };
  const content = `Olá ${firstName(user.name)}, sua assinatura do *Código Zero* foi cancelada com sucesso.\n\nSentimos sua falta! 😔\n\nSe quiser voltar a qualquer momento, é só renovar pelo link na plataforma.\n\nObrigado por ter feito parte da comunidade! 🤝`;
  return sendWhatsAppMessage({ phone: user.phone, content });
}
