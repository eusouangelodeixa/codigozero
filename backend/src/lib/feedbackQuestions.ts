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

/** WhatsApp text sent at D+21 asking for improvement suggestions. */
export const SUGGESTION_ASK_MESSAGE = (firstName: string) =>
  `${firstName ? `${firstName}, tudo` : 'Tudo'} bem? 👋\n\n` +
  `Aqui é da equipe do *Código Zero*. Estamos sempre melhorando a plataforma ` +
  `e a tua opinião vale ouro:\n\n` +
  `👉 *O que a gente poderia melhorar ou adicionar pra te ajudar mais?*\n\n` +
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
