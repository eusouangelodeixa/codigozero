// Shared copy defaults for the "Resgate o material dos Reels" LP (lp.czero.sbs).
// Imported by BOTH the public page (app/lp/LpClient.tsx) and the /admin/lp
// editor, so the two never drift. **bold** markers render as <strong> via
// renderBold(). Admin overrides live in LandingConfig.sections.lp (JSON) — the
// public page fetches them from GET /api/lp/config and merges over these.
//
// The LP is a distinct funnel from the sales landing (app/page.tsx): it captures
// name + WhatsApp + 3 quick qualifying answers, then hands the visitor to a free
// WhatsApp group and the Central de Material (central.czero.sbs).

export type LpSurveyStep = {
  key: string;                       // stored key inside User.surveyAnswers
  question: string;
  layout: "grid" | "stack";          // 2×2 grid or full-width stacked options
  options: string[];
};

export const LP_DEFAULTS = {
  // ── Hero ──────────────────────────────────────────────────────────────
  eyebrow: "✦ ÂNGELO DEIXA · CÓDIGO ZERO",
  heroTitlePre: "RESGATE O",
  heroTitleHighlight: "MATERIAL",           // rendered in terracotta italic
  heroTitlePost: "DOS REELS",
  heroDesc:
    "Chegou pela bio? Aqui é onde eu libero **todo o material prático** que apareço usando nos reels: guias, prompts e setups de IA e Claude Code. Preenche aí embaixo que eu te passo o acesso — e a **Central de Material** tá com tudo, pronto pra resgatar. Leva 15 segundos.",

  // ── Step 0 — name + WhatsApp ──────────────────────────────────────────
  formTitle: "Preenche pra resgatar o material 👇",
  formSubtitle: "Leva 10 segundos. É de graça.",
  nameLabel: "Seu nome",
  namePlaceholder: "Como você se chama?",
  whatsappLabel: "WhatsApp",
  whatsappPlaceholder: "84 123 4567",
  whatsappHint:
    "De fora de Moçambique? Digita com + e o código do país (ex: +55 11 91234-5678).",
  submitCta: "RESGATAR O MATERIAL →",
  formFootnote: "Sem spam. Só conteúdo prático sobre IA e Claude Code.",

  // ── Steps 1–3 — qualifying survey ─────────────────────────────────────
  surveyTitle: "Último passo 👇",
  // "N toques e o material é seu." — N counts down (3 → 1) across the 3 steps.
  surveySteps: [
    {
      key: "perfil",
      question: "O que você faz?",
      layout: "grid",
      options: ["Empreendedor", "Dev ou técnico", "Criador de conteúdo", "Outro"],
    },
    {
      key: "faturamento",
      question: "Quanto você fatura por mês?",
      layout: "grid",
      options: ["Ainda não faturo", "Até R$5 mil", "R$5 mil a R$20 mil", "R$20 mil ou mais"],
    },
    {
      key: "nivelIA",
      question: "Qual seu nível de IA?",
      layout: "stack",
      options: [
        "Nunca usei IA de verdade",
        "Uso ChatGPT às vezes, no básico",
        "Uso IA todo dia, quero avançar",
        "Já mexo com Claude Code / automações",
      ],
    },
  ] as LpSurveyStep[],

  // ── Success — "TÁ LIBERADO" ───────────────────────────────────────────
  successTitlePre: "TÁ",
  successTitleHighlight: "LIBERADO",
  successDesc:
    "O material não vem mais por aqui — agora tá tudo num lugar só. Faz esses 2 passos que leva 1 minuto.",
  step1Title: "Entra no grupo grátis do WhatsApp",
  step1Desc: "É de graça, sem spam. Conteúdo prático de IA e Claude Code direto no seu zap.",
  step1Cta: "ENTRAR NO GRUPO →",
  step2Title: "Pega o material na Central",
  step2Desc:
    "Na **Central de Material** tá o passo a passo deste reel e de todos os outros, num lugar só. É só escolher e resgatar.",
  step2Cta: "ABRIR A CENTRAL →",

  // ── Links (admin-configurable) ────────────────────────────────────────
  groupUrl: "",                                   // WhatsApp group invite link
  centralUrl: "https://central.czero.sbs",        // Central de Material hub

  // ── Footer ────────────────────────────────────────────────────────────
  footer: "Código Zero · IA · Claude Code na prática · @eusouangelodeixa",
};

export type LpConfig = typeof LP_DEFAULTS;
