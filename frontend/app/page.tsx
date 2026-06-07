"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  Radar as IconRadar,
  Send as IconSend,
  Library as IconLibrary,
  Hammer as IconHammer,
  Compass as IconCompass,
  MessagesSquare as IconMessages,
  ChevronDown as IconChevron,
  Star as IconStar,
  Shield as IconShield,
  Instagram as IconInstagram,
  Play as IconPlay,
  ArrowRight as IconArrow,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { StackScrolly } from "@/components/landing/StackScrolly";
import styles from "./landing.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ── Default texts (fallback when admin hasn't customized) ──
// Copy is direct, no PT-PT formality, no inflated "investor" tropes — every
// claim maps to something the product actually does (Radar/Disparador/Cofre/
// Forja/QG/Chat) or to verifiable network state (222 members on the Whop).
const DEFAULTS = {
  // ── Hero ─────────────────────────────────────────────────────────────
  heroTitle: "O ecossistema completo pra criar micronegócios de IA em Moçambique.",
  heroSubtitle: "Sem código. Sem barreiras.",
  heroDesc: "Radar de leads, Disparador de WhatsApp, biblioteca de scripts e a network privada que se encontra <strong>todos os domingos</strong>. Tudo num lugar só.",
  ctaText: "Entrar no Código Zero",
  trustText: "222 membros · Call toda semana · 6 ferramentas integradas",
  stat1Value: "222", stat1Label: "Membros na network",
  stat2Value: "Domingo", stat2Label: "Call ao vivo toda semana",
  stat3Value: "30 dias", stat3Label: "Garantia condicional",

  // ── VSL ──────────────────────────────────────────────────────────────
  vslTitle: "Código Zero — Apresentação",
  vslSubtitle: "Assiste à apresentação completa",
  vslHint: "Clica para ouvir",

  // ── Stack (6 ferramentas reais) ─────────────────────────────────────
  stackLabel: "O ecossistema por dentro",
  stackTitle: "Seis ferramentas que",
  stackTitleHighlight: "trabalham juntas.",
  stackDesc: "Cada peça faz uma coisa só, e faz bem. Tudo conectado à mesma conta, ao mesmo histórico de leads, à mesma comunidade.",
  stackTools: [
    {
      key: "radar",
      name: "Radar",
      verb: "Encontra os clientes.",
      desc: "Scanner de leads que varre o Google Maps por cidade e categoria. Devolve nome, telefone, Instagram, website e status de cada empresa. Sem CSV, sem trabalho manual.",
      bullets: ["Busca por cidade + categoria", "Telefone e Instagram dos donos", "Recomenda script do Cofre"],
    },
    {
      key: "disparador",
      name: "Disparador",
      verb: "Envia em massa.",
      desc: "Automação de WhatsApp ligada à API. Seleciona os leads do Radar, escolhe o script, dispara com variáveis personalizadas e log de cada envio para não bloquear o número.",
      bullets: ["Anti-block com intervalos", "Variáveis por contacto", "Histórico de envios"],
    },
    {
      key: "cofre",
      name: "Cofre",
      verb: "Guarda o que funciona.",
      desc: "Biblioteca privada de scripts de WhatsApp e prompts de IA, organizados em pastas. Copia, cola e usa. Atualizado com o que está convertendo agora na network.",
      bullets: ["Scripts de outbound testados", "Prompts para Make/n8n/ChatGPT", "Cópia rápida com 1 clique"],
    },
    {
      key: "forja",
      name: "Forja",
      verb: "Ensina a construir.",
      desc: "Aulas práticas — não teoria. Da landing page ao SaaS, passando por automações no Make, n8n e ChatGPT. Cada lição com link direto pra ferramenta usada.",
      bullets: ["Módulos práticos passo-a-passo", "Vídeos curtos sem enrolação", "Rastreio de progresso por lição"],
    },
    {
      key: "qg",
      name: "QG",
      verb: "Conecta a network.",
      desc: "Hub da comunidade: link direto da network privada, agenda da próxima call ao vivo de domingo, e o botão de entrar quando começar. Sem precisar entrar em vários grupos.",
      bullets: ["Countdown da próxima call", "Link permanente da network", "Entrada com 1 toque"],
    },
    {
      key: "chat",
      name: "Chat",
      verb: "Tira dúvidas em tempo real.",
      desc: "Dois canais: o feed aberto com todos os membros pra trocar ideia, e suporte 1:1 com a equipa pra quando travar em algo específico. Notificação push direto no celular.",
      bullets: ["Feed aberto da network", "Suporte 1:1 com equipa", "Push notifications no celular"],
    },
  ],

  // ── Network / Comunidade ─────────────────────────────────────────────
  networkLabel: "Código Zero — Network",
  networkTitle: "A comunidade privada",
  networkTitleHighlight: "onde tudo acontece.",
  networkMembersCount: "222",
  networkMembersLabel: "membros ativos",
  networkDesc: "Quem está construindo de verdade troca ideia aqui. Sem feed de gurus, sem teoria reciclada. Conteúdo de quem está executando.",
  networkPillars: [
    { title: "Call ao vivo todo domingo", desc: "Encontro semanal pra revisão da semana, problemas reais e o que está convertendo agora." },
    { title: "Troca real de conteúdo", desc: "Membros publicam o que está funcionando — scripts, prompts, automações que fecharam contrato." },
    { title: "Construção de SaaS em conjunto", desc: "Projetos coletivos: alguém começa, a network ajuda a finalizar. Quem participa, divide." },
    { title: "Irmandade, não audiência", desc: "Não é um grupo de Discord com 5 mil pessoas mudas. É 222 que se conhecem pelo nome." },
  ],

  // ── Como funciona ────────────────────────────────────────────────────
  flowLabel: "Como funciona",
  flowTitle: "Quatro passos do",
  flowTitleHighlight: "pagamento à primeira call.",
  flowSteps: [
    { num: "01", title: "Pagas a assinatura", desc: "M-Pesa, e-Mola ou cartão. Aprovação na hora." },
    { num: "02", title: "Recebes acesso no WhatsApp", desc: "Email e senha enviados no número que cadastraste. Em segundos." },
    { num: "03", title: "Entras na network", desc: "Link direto da network privada no QG. Apresentas-te e começas a interagir." },
    { num: "04", title: "Próxima call de domingo", desc: "Aparece no Zoom no horário marcado e começa a executar o método na semana seguinte." },
  ],

  // ── Pricing ──────────────────────────────────────────────────────────
  scarcityLabel: "Acesso atual",
  scarcityTitle: "Network em construção.",
  scarcityDesc: "222 membros e crescendo. Quem entra agora pega a network ainda pequena — onde dá pra conhecer todo mundo pelo nome e a tua voz na call ainda tem peso.",
  priceFrom: "",
  priceAmount: "497",
  pricePeriod: "MT/mês",
  priceSub: "Cancelas quando quiseres, sem multa. Pagamento mensal, acesso a tudo.",
  priceCtaText: "Entrar no Código Zero — 497 MT/mês",

  // ── Close Friends (upsell exibido na pricing section) ──────────────
  closeFriendsLabel: "Close Friends",
  closeFriendsTitle: "Opcional: Close Friends",
  closeFriendsDesc: "Add-on de 1.297 MT, pagamento único no checkout. Dá <strong>3 meses corridos</strong> de acesso (em vez de 1), badge dourado na conta e prioridade nas calls de domingo.",

  // ── Garantia ────────────────────────────────────────────────────────
  guaranteeLabel: "Garantia",
  guaranteeTitle: "30 dias, risco do nosso lado.",
  guaranteeText1: "Entras, usas o Radar, envias com o Disparador, assistes à primeira call de domingo.",
  guaranteeText2: "",
  guaranteeHighlight: "Se em 30 dias não fechares pelo menos 1 contrato de 3.000 MT usando o sistema, devolvemos o dobro do que pagaste — e ainda dou 1 hora 1:1 contigo pra entender o que travou.",
  guaranteeConclusion: "A única forma de sair perdendo aqui é não entrando.",
  guaranteeCtaText: "Aceitar e entrar agora",

  // ── FAQ ──────────────────────────────────────────────────────────────
  faqLabel: "Perguntas frequentes",
  faqTitle: "O que costumam perguntar.",
  faqItems: [
    { q: "Preciso saber programar?", a: "Não. O Código Zero foi feito pra quem nunca abriu uma IDE. Tudo é visual: o Radar tem botões, o Disparador tem botões, a Forja ensina a usar IAs visuais (Make, n8n, ChatGPT). Se aparece código, é só pra copiar e colar." },
    { q: "Quanto tempo até ver o primeiro resultado?", a: "Depende de quanto tempo dedicas. A maior parte da network fecha o primeiro contrato entre a segunda e a quarta semana. A garantia condicional é desenhada em cima desse prazo (30 dias)." },
    { q: "O número de WhatsApp que vou usar bloqueia?", a: "O Disparador tem intervalo configurável entre envios pra simular comportamento humano. Recomendamos um número dedicado, mas o teu pessoal funciona se respeitar o limite diário." },
    { q: "Cancelar é fácil?", a: "Sim. Pelo painel, em /assinatura, em 2 cliques. Sem ligação, sem retenção forçada. Se cancelares, o acesso vai até o fim do mês pago." },
    { q: "Já tentei vender curso de IA e não funcionou. Aqui é diferente?", a: "Aqui não estás vendendo curso. Estás vendendo automações e SaaS pra empresas que pagam recorrente. É outro mercado: B2B com leads quentes, não info-produto pra pessoa física." },
  ],

  // ── Footer ───────────────────────────────────────────────────────────
  footerDesc: "O ecossistema de tecnologia para criar micronegócios de IA em Moçambique. Sem código, sem barreiras.",

  // ── Legacy fields (kept for backwards-compat with stored sections JSON) ──
  painLabel: "", painTitle: "", painTitleHighlight: "", painDesc: "", painItems: [],
  painConclusion: "", painConclusionSub: "",
  solutionLabel: "", solutionTitle: "", solutionTitleHighlight: "", solutionDesc: "", solutionCards: [],
  valueLabel: "", valueTitle: "", valueTitleHighlight: "", valueDesc: "", valueItems: [],
  valueTotalLabel: "", valueTotalAmount: "", valuePunchline: "",
};

// When loaded via /r/[code], the affiliate landing variant overrides the VSL
// and forces all checkout URLs to the standard public affiliate checkout
// (the system attributes commissions via the captured email on the webhook).
export interface AffiliateContext {
  code: string;
  affiliateVslEmbedHtml?: string | null;
  checkoutUrl?: string;
}

/**
 * When the landing is rendered at /c/{code}, the page is the exact same
 * page as /, but every lead/checkout call is tagged with this coproducer
 * so the webhook can attribute the resulting sale to them. `checkoutUrl`
 * is the public fallback used when the API can't return a personalised
 * order URL.
 */
export interface CoproducerContext {
  code: string;
  checkoutUrl?: string;
  vslEmbedHtml?: string | null;
  headScripts?: string | null;
}

export default function LandingPage({
  affiliateContext,
  coproducerContext,
}: {
  affiliateContext?: AffiliateContext;
  coproducerContext?: CoproducerContext;
} = {}) {
  const [gateOpen, setGateOpen] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", whatsapp: "", email: "", phoneCode: "+258", whatsappCode: "+258" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("#preco");
  const [cfg, setCfg] = useState<any>({});
  const [sec, setSec] = useState<any>({});
  
  // Survey states
  const [surveyStep, setSurveyStep] = useState(0);
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});

  const SURVEY_STEPS = [
    {
      id: 'goal',
      title: 'Qual é o seu principal objetivo financeiro para os próximos 6 meses?',
      options: [
        { id: 'A', text: 'Ter uma renda extra segura de 10.000 a 20.000 MT mensais.' },
        { id: 'B', text: 'Substituir minha renda atual e gerar 50.000 MT ou mais.' },
        { id: 'C', text: 'Criar um negócio digital escalável e independente.' }
      ]
    },
    {
      id: 'pain',
      title: 'O que tem te impedido de alcançar esse resultado até hoje?',
      options: [
        { id: 'A', text: 'Não sei programar e acho tecnologia muito complexo.' },
        { id: 'B', text: 'Não tenho ideia do que vender ou como achar clientes.' },
        { id: 'C', text: 'Já tentei mercado de afiliados/e-books e não funcionou.' },
        { id: 'D', text: 'Não tenho dinheiro para investir em ferramentas caras de IA.' }
      ]
    },
    {
      id: 'commitment',
      title: 'Se você tivesse acesso a um ecossistema que entrega os clientes e ferramentas que fazem o trabalho técnico por você, quanto tempo você se dedicaria?',
      options: [
        { id: 'A', text: '1 a 2 horas por dia.' },
        { id: 'B', text: '3 a 4 horas por dia.' },
        { id: 'C', text: 'O tempo que for necessário para dar certo.' }
      ]
    },
    {
      id: 'awareness',
      title: 'Você sabia que hoje a demanda das empresas por automações é gigante, e que é possível criar tudo isso usando Inteligência Artificial sem digitar uma linha de código?',
      options: [
        { id: 'A', text: 'Sim, mas não sei por onde começar.' },
        { id: 'B', text: 'Não, isso é totalmente novo para mim.' }
      ]
    }
  ];

  const LEAD_VERSION = "v2";

  // Load landing config from API
  useEffect(() => {
    fetch(`${API_URL}/api/landing/config`)
      .then(r => r.json())
      .then(data => {
        if (data.config) {
          setCfg(data.config);
          if (data.config.sections) setSec(data.config.sections);
        }
      })
      .catch(() => {});
  }, []);

  // Helper: get text with fallback
  const t = (key: string) => sec[key] || cfg[key] || (DEFAULTS as any)[key] || "";

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cz_lead");
      if (saved) {
        const lead = JSON.parse(saved);
        if (lead.name && lead.email) {
          if (lead._v !== LEAD_VERSION || !lead.checkoutUrl) {
            // Re-fetch checkout URL — DON'T close gate until we have it
            fetch(`${API_URL}/api/landing/lead`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: lead.name,
                email: lead.email,
                phone: lead.phone,
                whatsapp: lead.whatsapp,
                ...(affiliateContext?.code ? { affiliateCode: affiliateContext.code } : {}),
                ...(coproducerContext?.code ? { coproducerCode: coproducerContext.code } : {}),
              }),
            })
              .then(r => r.json())
              .then(data => {
                if (data.success && data.checkoutUrl) {
                  lead.checkoutUrl = data.checkoutUrl;
                  lead.leadId = data.leadId;
                  lead._v = LEAD_VERSION;
                  // Não atualiza o savedAt aqui para manter a data do primeiro cadastro
                  localStorage.setItem("cz_lead", JSON.stringify(lead));
                  setCheckoutUrl(data.checkoutUrl);
                }
              })
              .catch(() => {})
              .finally(() => setGateOpen(false));
          } else {
            // Check if 4 hours have passed since the lead was saved
            const savedTime = new Date(lead.savedAt || Date.now()).getTime();
            const hoursPassed = (Date.now() - savedTime) / (1000 * 60 * 60);

            if (hoursPassed >= 4) {
              const fallbackBase = affiliateContext?.checkoutUrl
                || coproducerContext?.checkoutUrl
                || "https://pay.lojou.app/p/uoEHz";
              const fallbackUrl = new URL(fallbackBase);
              fallbackUrl.searchParams.append("name", lead.name);
              fallbackUrl.searchParams.append("email", lead.email);
              if (lead.whatsapp) fallbackUrl.searchParams.append("number", lead.whatsapp.replace(/\D/g, ''));

              setCheckoutUrl(fallbackUrl.toString());
            } else {
              setCheckoutUrl(lead.checkoutUrl);
            }
            setGateOpen(false);
          }
          return;
        }
      }
    } catch {}
    setGateOpen(true);
  }, []);

  // Handle anchor links (e.g. czero.sbs/#preco) — scroll after page mounts
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash?.replace("#", "");
    if (!hash) return;
    // Small delay to ensure the DOM is fully rendered
    const t = setTimeout(() => {
      const el = document.getElementById(hash);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 600);
    return () => clearTimeout(t);
  }, []);

  // Coproducer tracking pixels — inject the configured HTML into <head>
  // when /c/{code} is loaded. Scripts inserted via innerHTML don't execute,
  // so each <script> is rebuilt with document.createElement.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = coproducerContext?.headScripts?.trim();
    if (!raw) return;
    const tag = "data-cz-cop-pixel";
    const tmpl = document.createElement("template");
    tmpl.innerHTML = raw;
    const added: HTMLElement[] = [];
    tmpl.content.childNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      const el = node as HTMLElement;
      if (el.tagName === "SCRIPT") {
        const s = document.createElement("script");
        for (const attr of Array.from(el.attributes)) s.setAttribute(attr.name, attr.value);
        s.text = el.textContent || "";
        s.setAttribute(tag, "1");
        document.head.appendChild(s);
        added.push(s);
      } else {
        el.setAttribute(tag, "1");
        document.head.appendChild(el);
        added.push(el);
      }
    });
    return () => {
      added.forEach((n) => n.parentNode?.removeChild(n));
    };
  }, [coproducerContext?.headScripts]);

  const handleGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    setSubmitting(true);
    
    // Concatenate phone code with number (Use whatsapp for both)
    const finalWhatsapp = formData.whatsapp ? `${formData.whatsappCode}${formData.whatsapp.replace(/\D/g, '')}` : "";
    
    const payload = {
      ...formData,
      phone: finalWhatsapp,
      whatsapp: finalWhatsapp,
      // phoneCode is the country dial code (e.g. "+258", "+351").
      // Backend uses it to decide between Lojou (MZ) and Stripe
      // (everyone else) when returning the checkoutUrl.
      phoneCode: formData.whatsappCode,
      surveyAnswers,
      ...(affiliateContext?.code ? { affiliateCode: affiliateContext.code } : {}),
      ...(coproducerContext?.code ? { coproducerCode: coproducerContext.code } : {}),
    };

    const leadRecord: Record<string, any> = { ...payload, savedAt: new Date().toISOString(), _v: LEAD_VERSION };
    localStorage.setItem("cz_lead", JSON.stringify(leadRecord));
    try {
      const res = await fetch(`${API_URL}/api/landing/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success && data.checkoutUrl) {
        leadRecord.leadId = data.leadId;
        leadRecord.checkoutUrl = data.checkoutUrl;
        localStorage.setItem("cz_lead", JSON.stringify(leadRecord));
        setCheckoutUrl(data.checkoutUrl);
      }
    } catch (err) {
      console.warn("[Landing] API call failed, lead saved locally:", err);
    } finally {
      setSubmitting(false);
      setGateOpen(false);
    }
  };

  const handleSurveyOptionClick = (questionId: string, optionText: string) => {
    setSurveyAnswers(prev => ({ ...prev, [questionId]: optionText }));
    // Move to next step smoothly
    setTimeout(() => {
      setSurveyStep(prev => prev + 1);
    }, 250);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const hasCheckout = !!checkoutUrl && checkoutUrl !== "#preco" && checkoutUrl !== "#";

  const trackAndOpen = () => {
    // Mark checkout_pending in backend (fire & forget)
    try {
      const saved = localStorage.getItem("cz_lead");
      if (saved) {
        const lead = JSON.parse(saved);
        if (lead.leadId) {
          fetch(`${API_URL}/api/landing/checkout-click`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: lead.leadId }),
          }).catch(() => {});
        }
      }
    } catch {}
  };

  // Renders the CTA correctly: real link when we have a checkout URL, scroll button otherwise
  const CtaLink = ({ className, children }: { className: string; children: React.ReactNode }) =>
    hasCheckout ? (
      <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className={className}
         onClick={trackAndOpen} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
        {children}
      </a>
    ) : (
      <button className={className} onClick={() => scrollTo("preco")}
              style={{ display: 'block', width: '100%', textAlign: 'center', cursor: 'pointer', border: 'none' }}>
        {children}
      </button>
    );


  // Dynamic arrays with fallbacks
  const stackTools = (sec.stackTools || DEFAULTS.stackTools) as { key: string; name: string; verb: string; desc: string; bullets: string[] }[];
  const networkPillars = (sec.networkPillars || DEFAULTS.networkPillars) as { title: string; desc: string }[];
  const flowSteps = (sec.flowSteps || DEFAULTS.flowSteps) as { num: string; title: string; desc: string }[];
  const faqItems = (sec.faqItems || DEFAULTS.faqItems) as { q: string; a: string }[];

  // Icon per tool (lucide-react) — keyed by the tool's `key` field so admin
  // reorders don't desync icons from names.
  const TOOL_ICONS: Record<string, React.ReactNode> = {
    radar: <IconRadar size={22} strokeWidth={1.6} />,
    disparador: <IconSend size={22} strokeWidth={1.6} />,
    cofre: <IconLibrary size={22} strokeWidth={1.6} />,
    forja: <IconHammer size={22} strokeWidth={1.6} />,
    qg: <IconCompass size={22} strokeWidth={1.6} />,
    chat: <IconMessages size={22} strokeWidth={1.6} />,
  };

  // FAQ toggle state — only one open at a time keeps the page tidy.
  const [faqOpen, setFaqOpen] = useState<number | null>(0);

  // Respect prefers-reduced-motion: motion lib gives null on SSR, so we
  // gate all animations through this and fall back to fully-visible state.
  const reduceMotion = useReducedMotion();
  const reveal = reduceMotion
    ? { initial: false, animate: { opacity: 1, y: 0 } }
    : {
        initial: { opacity: 0, y: 24 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-80px" },
        transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
      };

  return (
    <>
      {/* Gate */}
      {gateOpen === null && (
        <div className={styles.gate}><div className={styles.gateInner}><div style={{ display: "flex", justifyContent: "center" }}><Logo size={32} /></div><p style={{ color: "#888", marginTop: 12 }}>Carregando...</p></div></div>
      )}
      {gateOpen === true && (
        <div className={styles.gate}>
          <div className={styles.gateInner}>
            {surveyStep === 0 ? (
              /* ── HOOK PAGE (Hormozi-style awareness) ── */
              <div className={styles.surveyFadeIn}>
                <div className={styles.hookPage}>
                  <Logo size={36} />
                  <div className={styles.hookBadge}>⚡ ACESSO RESTRITO</div>
                  <h1 className={styles.hookTitle}>
                    Existe um novo modelo de negócio em Moçambique que está a gerar{' '}
                    <span className={styles.hookHighlight}>50.000 MT/mês</span>{' '}
                    sem programar uma linha de código.
                  </h1>
                  <p className={styles.hookDesc}>
                    Nós preparamos uma aula gratuita que revela os bastidores deste ecossistema. 
                    Mas antes de liberar o acesso, precisamos confirmar se este modelo é para você.
                  </p>
                  <div className={styles.hookSteps}>
                    <div className={styles.hookStep}>
                      <div className={styles.hookStepNum}>1</div>
                      <div>
                        <strong>Responda 4 perguntas rápidas</strong>
                        <span>Menos de 60 segundos</span>
                      </div>
                    </div>
                    <div className={styles.hookStep}>
                      <div className={styles.hookStepNum}>2</div>
                      <div>
                        <strong>Preencha seus dados</strong>
                        <span>Para liberar o seu acesso</span>
                      </div>
                    </div>
                    <div className={styles.hookStep}>
                      <div className={styles.hookStepNum}>3</div>
                      <div>
                        <strong>Assista a aula completa</strong>
                        <span>Acesso imediato e gratuito</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    className={styles.hookCta} 
                    onClick={() => setSurveyStep(1)}
                  >
                    Quero Descobrir Se É Para Mim →
                  </button>
                  <p className={styles.hookFootnote}>
                    🔒 Sem compromisso. Sem cartão de crédito. Apenas conhecimento.
                  </p>
                </div>
              </div>
            ) : surveyStep <= 4 ? (
              <div key={`step-${surveyStep}`} className={styles.surveyFadeIn}>
                <div className={styles.gateSurveyHeader}>
                  <span className={styles.gateSurveyStep}>PERGUNTA {surveyStep} DE 4</span>
                  <h2 className={styles.gateSurveyTitle}>{SURVEY_STEPS[surveyStep - 1].title}</h2>
                </div>
                <div className={styles.surveyOptions}>
                  {SURVEY_STEPS[surveyStep - 1].options.map(option => (
                    <button 
                      key={option.id}
                      className={styles.surveyOptionBtn}
                      onClick={() => handleSurveyOptionClick(SURVEY_STEPS[surveyStep - 1].id, option.text)}
                    >
                      <div className={styles.surveyOptionLetter}>{option.id}</div>
                      <span>{option.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.surveyFadeIn}>
                <Logo size={40} />
                <h2 className={styles.gateTitle} style={{ marginTop: '16px' }}>Diagnóstico Concluído.</h2>
                <p className={styles.gateSubtitle} style={{ marginBottom: '24px', fontSize: '14px' }}>
                  Com base nas suas respostas, você tem o perfil ideal para o novo modelo de micronegócios de IA em Moçambique. Liberamos um vídeo restrito mostrando os bastidores.
                </p>
                <form className={styles.gateForm} onSubmit={handleGateSubmit}>
                  <div>
                    <label className={styles.gateLabel} style={{textTransform: 'none', letterSpacing: 'normal'}}>Nome Completo <span style={{color: '#888', fontWeight: 400}}>(Como devemos te chamar no sistema?)</span></label>
                    <input className={styles.gateInput} placeholder="Seu nome completo" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div>
                    <label className={styles.gateLabel} style={{textTransform: 'none', letterSpacing: 'normal'}}>E-mail Principal <span style={{color: '#888', fontWeight: 400}}>(Para envio do link seguro)</span></label>
                    <input className={styles.gateInput} placeholder="Seu melhor e-mail" type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                  <div>
                    <label className={styles.gateLabel} style={{textTransform: 'none', letterSpacing: 'normal'}}>WhatsApp <span style={{color: '#888', fontWeight: 400}}>(Para suporte e materiais)</span></label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select className={styles.gateInput} style={{ width: '120px', padding: '0 8px' }} value={formData.whatsappCode} onChange={e => setFormData({ ...formData, whatsappCode: e.target.value })}>
                        <option value="+258">🇲🇿 +258</option>
                        <option value="+244">🇦🇴 +244</option>
                        <option value="+55">🇧🇷 +55</option>
                        <option value="+351">🇵🇹 +351</option>
                        <option value="+1">🇺🇸 +1</option>
                      </select>
                      <input className={styles.gateInput} style={{ flex: 1 }} placeholder="WhatsApp" required value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value })} />
                    </div>
                  </div>
                  
                  <button className={styles.gateSubmit} type="submit" disabled={submitting}>
                    {submitting ? "Processando..." : "🔓 Desbloquear Meu Acesso ao Vídeo"}
                  </button>
                  <div className={styles.gateFooter}>
                    🔒 Suas informações estão seguras. Privacidade total garantida.
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Landing */}
      {gateOpen === false && (
      <div>
        {/* NAV */}
        <nav className={styles.nav}>
          <div className={styles.navInner}>
            <div className={styles.navLogo}>
              <Logo size={26} />
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className={styles.hero}>
          <motion.div className={styles.heroContent} {...reveal}>
            <h1 className={styles.heroTitle}>{t("heroTitle")}</h1>
            <p className={styles.heroSubtitle}>{t("heroSubtitle")}</p>
            <p className={styles.heroDesc} dangerouslySetInnerHTML={{ __html: t("heroDesc") }} />
          </motion.div>

          {/* VSL */}
          <motion.div
            className={styles.heroMedia}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.vslWrapper}>
              <div className={styles.vslBar}>
                <span className={`${styles.vslDot} ${styles.vslDotR}`} />
                <span className={`${styles.vslDot} ${styles.vslDotY}`} />
                <span className={`${styles.vslDot} ${styles.vslDotG}`} />
                <span className={styles.vslBarTitle}>{t("vslTitle")}</span>
              </div>

              {(coproducerContext?.vslEmbedHtml || affiliateContext?.affiliateVslEmbedHtml || cfg.vslEmbedHtml) ? (
                <div
                  className={styles.vslEmbed}
                  dangerouslySetInnerHTML={{
                    __html: coproducerContext?.vslEmbedHtml || affiliateContext?.affiliateVslEmbedHtml || cfg.vslEmbedHtml,
                  }}
                />
              ) : (
                <div className={styles.vslPlaceholder}>
                  <div className={styles.vslPlayBtn}>
                    <IconPlay size={28} fill="currentColor" strokeWidth={0} />
                  </div>
                  <p className={styles.vslText}>{t("vslSubtitle")}</p>
                  <p className={styles.vslHint}>{t("vslHint")}</p>
                </div>
              )}
            </div>
          </motion.div>
        </section>

        {/* STACK — 6 ferramentas com pinning + scroll-triggered (desktop) */}
        <section id="ferramentas" className={styles.sectionFlush}>
          <motion.div {...reveal} className={styles.sectionHead}>
            <span className={styles.sectionLabel}>{t("stackLabel")}</span>
            <h2 className={styles.sectionTitle}>
              {t("stackTitle")}{" "}
              <span className={styles.sectionTitleHighlight}>{t("stackTitleHighlight")}</span>
            </h2>
            <p className={styles.sectionDesc}>{t("stackDesc")}</p>
          </motion.div>

          <StackScrolly tools={stackTools} toolIcons={TOOL_ICONS} />
        </section>

        {/* NETWORK */}
        <section id="network" className={styles.networkSection}>
          <motion.div {...reveal} className={styles.networkInner}>
            <div className={styles.networkText}>
              <span className={styles.sectionLabel}>{t("networkLabel")}</span>
              <h2 className={styles.sectionTitle}>
                {t("networkTitle")}{" "}
                <span className={styles.sectionTitleHighlight}>{t("networkTitleHighlight")}</span>
              </h2>
              <p className={styles.sectionDesc}>{t("networkDesc")}</p>

              <div className={styles.networkCount}>
                <span className={styles.networkCountValue}>{t("networkMembersCount")}</span>
                <span className={styles.networkCountLabel}>{t("networkMembersLabel")}</span>
                <span className={styles.networkLiveDot} />
                <span className={styles.networkLiveText}>ao vivo agora</span>
              </div>

              <ul className={styles.networkPillars}>
                {networkPillars.map((p, i) => (
                  <li key={i} className={styles.networkPillar}>
                    <span className={styles.networkPillarNum}>0{i + 1}</span>
                    <div>
                      <h4 className={styles.networkPillarTitle}>{p.title}</h4>
                      <p className={styles.networkPillarDesc}>{p.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <motion.div
              className={styles.networkImageWrap}
              initial={reduceMotion ? false : { opacity: 0, x: 32 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.networkImageGlow} aria-hidden />
              <Image
                src="/comunidade-upgrade.png"
                alt="Network privada do Código Zero: 222 membros ativos"
                width={1179}
                height={885}
                className={styles.networkImage}
                priority={false}
              />
            </motion.div>
          </motion.div>
        </section>

        {/* FLOW */}
        <section className={styles.section}>
          <motion.div {...reveal} className={styles.sectionHead}>
            <span className={styles.sectionLabel}>{t("flowLabel")}</span>
            <h2 className={styles.sectionTitle}>
              {t("flowTitle")}{" "}
              <span className={styles.sectionTitleHighlight}>{t("flowTitleHighlight")}</span>
            </h2>
          </motion.div>

          <div className={styles.flowGrid}>
            {flowSteps.map((step, i) => (
              <motion.div
                key={i}
                className={styles.flowStep}
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className={styles.flowNum}>{step.num}</span>
                <h3 className={styles.flowTitle}>{step.title}</h3>
                <p className={styles.flowDesc}>{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* PRICING + CLOSE FRIENDS */}
        <section id="preco" className={styles.pricingSection}>
          <motion.div {...reveal} className={styles.scarcityBlock}>
            <span className={styles.sectionLabel}>{t("scarcityLabel")}</span>
            <h3 className={styles.scarcityTitle}>{t("scarcityTitle")}</h3>
            <p className={styles.scarcityText}>{t("scarcityDesc")}</p>
          </motion.div>

          <motion.div
            className={styles.pricingCard}
            initial={reduceMotion ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.priceBig}>
              {t("priceAmount")} <span className={styles.priceAccent}>{t("pricePeriod")}</span>
            </div>
            <p className={styles.priceSub}>{t("priceSub")}</p>
            <CtaLink className={styles.priceCta}>{t("priceCtaText")}</CtaLink>

            <div className={styles.cfCallout}>
              <span className={styles.cfBadge}>
                <IconStar size={12} fill="currentColor" strokeWidth={0} />
                {t("closeFriendsLabel")}
              </span>
              <h4 className={styles.cfTitle}>{t("closeFriendsTitle")}</h4>
              <p className={styles.cfDesc} dangerouslySetInnerHTML={{ __html: t("closeFriendsDesc") }} />
            </div>
          </motion.div>
        </section>

        {/* GUARANTEE */}
        <section className={styles.guaranteeSection}>
          <motion.div {...reveal} className={styles.guaranteeCard}>
            <div className={styles.guaranteeShield}>
              <IconShield size={40} strokeWidth={1.5} />
            </div>
            <span className={styles.guaranteeLabel}>{t("guaranteeLabel")}</span>
            <h2 className={styles.guaranteeTitle}>{t("guaranteeTitle")}</h2>
            {t("guaranteeText1") && <p className={styles.guaranteeText}>{t("guaranteeText1")}</p>}
            {t("guaranteeText2") && <p className={styles.guaranteeText}>{t("guaranteeText2")}</p>}
            <p className={styles.guaranteeHighlight}>{t("guaranteeHighlight")}</p>
            <p className={styles.guaranteeConclusion}>{t("guaranteeConclusion")}</p>
            <CtaLink className={styles.guaranteeCta}>{t("guaranteeCtaText")}</CtaLink>
          </motion.div>
        </section>

        {/* FAQ */}
        <section className={styles.section}>
          <motion.div {...reveal} className={styles.sectionHead}>
            <span className={styles.sectionLabel}>{t("faqLabel")}</span>
            <h2 className={styles.sectionTitle}>{t("faqTitle")}</h2>
          </motion.div>

          <div className={styles.faqList}>
            {faqItems.map((item, i) => {
              const open = faqOpen === i;
              return (
                <div key={i} className={`${styles.faqItem} ${open ? styles.faqItemOpen : ""}`}>
                  <button
                    type="button"
                    className={styles.faqQ}
                    onClick={() => setFaqOpen(open ? null : i)}
                    aria-expanded={open}
                  >
                    <span>{item.q}</span>
                    <span className={styles.faqChev} aria-hidden>
                      <IconChevron size={14} strokeWidth={2} />
                    </span>
                  </button>
                  <motion.div
                    initial={false}
                    animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                    style={{ overflow: "hidden" }}
                  >
                    <p className={styles.faqA}>{item.a}</p>
                  </motion.div>
                </div>
              );
            })}
          </div>
        </section>

        {/* FINAL CTA */}
        <section className={styles.finalCta}>
          <motion.div {...reveal}>
            <h2 className={styles.finalCtaTitle}>Pronto para entrar?</h2>
            <p className={styles.finalCtaDesc}>O acesso é imediato. A próxima call é no domingo.</p>
            <CtaLink className={styles.heroCta}>{t("priceCtaText")}</CtaLink>
          </motion.div>
        </section>

        {/* FOOTER */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div>
              <div className={styles.footerLogo}><Logo size={24} /></div>
              <p className={styles.footerDesc}>{t("footerDesc")}</p>
              <a href="https://www.instagram.com/ocodigozero_/" target="_blank" rel="noopener noreferrer" className={styles.footerLink} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                <IconInstagram size={16} strokeWidth={1.5} />
                @ocodigozero_
              </a>
            </div>
            <div>
              <h4 className={styles.footerColTitle}>Links</h4>
              <div className={styles.footerLinks}>
                <a href="/login" className={styles.footerLink}>Área de Membros</a>
              </div>
            </div>
            <div>
              <h4 className={styles.footerColTitle}>Legal</h4>
              <div className={styles.footerLinks}>
                <a href="/termos" className={styles.footerLink}>Termos de Uso</a>
                <a href="/privacidade" className={styles.footerLink}>Privacidade</a>
              </div>
            </div>
          </div>
          <div className={styles.footerBottom}>
            © {new Date().getFullYear()} Código Zero. Todos os direitos reservados.
          </div>
        </footer>
      </div>
      )}
    </>
  );
}
