/**
 * Post-purchase feedback survey — question set + measurement scale.
 *
 * Single source of truth shared by the WhatsApp poll sender, the poll.vote
 * webhook ingestion, the public /api/feedback routes (the /pesquisa page
 * fetches questions from here — the frontend never hardcodes a copy) and the
 * admin KPI aggregation. questionKey values are PERSISTED in
 * FeedbackResponse.questionKey — never rename them once live.
 */

/** 4-level forced-choice scale — score = index + 1 (1..4). CSAT = score >= 3. */
export const FEEDBACK_OPTIONS = [
  'Abaixo do esperado',
  'Suficiente',
  'Bom',
  'Excelente',
] as const;

export interface FeedbackQuestion {
  key: string;
  text: string;
  /** Short label for the admin dashboard (chart rows). */
  label: string;
}

export const FEEDBACK_QUESTIONS: FeedbackQuestion[] = [
  {
    key: 'satisfaction',
    text: 'Como você avalia sua experiência geral com o Código Zero até agora?',
    label: 'Satisfação geral',
  },
  {
    key: 'expectation',
    text: 'O que você encontrou dentro do Código Zero correspondeu ao que esperava quando comprou?',
    label: 'Expectativa vs entrega',
  },
  {
    key: 'value',
    text: 'Como você avalia o custo-benefício da sua assinatura do Código Zero?',
    label: 'Preço / valor',
  },
  {
    key: 'support',
    text: 'Como você avalia o suporte e o atendimento da equipe do Código Zero?',
    label: 'Suporte / atendimento',
  },
];

/** Consent ask sent BEFORE the D+14 poll session starts (WhatsApp channel
 *  only — opening the emailed web link is already consent). SIM starts the
 *  polls, NÃO closes both sessions politely, silence expires in 48h. */
export const FEEDBACK_CONSENT_MESSAGE = (firstName: string) =>
  `${firstName ? `Oi ${firstName}! 👋` : 'Oi! 👋'} Aqui é da equipe do *Código Zero*.\n\n` +
  `Já tens algumas semanas com a gente e a tua opinião vale muito. Podemos te ` +
  `enviar *4 perguntas rapidinhas* sobre a tua experiência? É só tocar na ` +
  `resposta — leva menos de 1 minuto.\n\n` +
  `👉 Responde *SIM* pra começar (ou *NÃO*, sem problema nenhum).`;

/** Consent ask sent at D+21 BEFORE the suggestion request. */
export const SUGGESTION_CONSENT_MESSAGE = (firstName: string) =>
  `${firstName ? `${firstName}, tudo` : 'Tudo'} bem? 👋 Equipe do *Código Zero* por aqui.\n\n` +
  `Podemos te pedir *uma sugestão rápida* pra melhorar a plataforma?\n\n` +
  `👉 Responde *SIM* que te faço a pergunta 🙂 (ou *NÃO*, tranquilo).`;

/** Polite close when the user declines either consent ask. */
export const CONSENT_DECLINED_ACK =
  'Tranquilo, sem problema! 🙏 Obrigado pelo teu tempo — qualquer coisa, estamos por aqui.';

/** WhatsApp text sent after the D+21 consent SIM, asking for suggestions. */
export const SUGGESTION_ASK_MESSAGE = (firstName: string) =>
  `${firstName ? `${firstName}, obrigado` : 'Obrigado'}! 🙌\n\n` +
  `👉 *O que a gente poderia melhorar ou adicionar no Código Zero pra te ajudar mais?*\n\n` +
  `Pode responder aqui mesmo com toda sinceridade — a tua sugestão vai direto ` +
  `pra nossa equipe. 🙏`;

/** One-time thank-you after the first suggestion reply. */
export const SUGGESTION_THANKS_MESSAGE =
  'Recebido! 🙏 Muito obrigado pela sugestão — ela vai direto pra nossa equipe. ' +
  'Se lembrar de mais alguma coisa, pode mandar aqui.';

const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

/**
 * Map a voted option label back to its 1–4 score. Accent/case-insensitive so
 * a Komunika/Evolution round-trip that mangles diacritics still matches.
 * Returns null for anything that isn't one of ours.
 */
export function scoreForOption(name: string): number | null {
  const i = FEEDBACK_OPTIONS.findIndex((o) => norm(o) === norm(name));
  return i >= 0 ? i + 1 : null;
}

const CONSENT_YES = new Set([
  'sim', 's', 'ss', 'simm', 'pode', 'podes', 'claro', 'ok', 'okay', 'okk',
  'bora', 'manda', 'vamos', 'vai', 'quero', 'positivo', 'yes', 'dale',
]);
const CONSENT_NO = new Set(['nao', 'n', 'nn', 'naoo', 'no', 'pare', 'stop', 'nunca']);

/**
 * Interpret a free-text reply to a consent ask. Rules, in order:
 * 1. Leading negative/affirmative wins — "não quero", "não, obrigado" são
 *    NÃO mesmo contendo palavras afirmativas ("quero"); "sim, mas…" é SIM.
 *    Errar para o lado do "não" é o lado seguro num pedido de consentimento.
 * 2. Otherwise only an EXCLUSIVE signal counts; mensagens com ambos ou com
 *    nenhum retornam null e são ignoradas (a pessoa pode estar falando com o
 *    suporte), mantendo a janela de consentimento aberta.
 */
export function parseConsentReply(text: string): 'yes' | 'no' | null {
  const tokens = norm(text).split(/[^a-z0-9]+/).filter(Boolean).slice(0, 12);
  if (tokens.length === 0) return null;
  if (CONSENT_NO.has(tokens[0])) return 'no';
  if (CONSENT_YES.has(tokens[0])) return 'yes';
  const hasYes = tokens.some((t) => CONSENT_YES.has(t));
  const hasNo = tokens.some((t) => CONSENT_NO.has(t));
  if (hasYes && !hasNo) return 'yes';
  if (hasNo && !hasYes) return 'no';
  return null;
}
