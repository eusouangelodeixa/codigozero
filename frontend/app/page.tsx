"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  ChevronDown as IconChevron,
  Star as IconStar,
  Shield as IconShield,
  Instagram as IconInstagram,
  Play as IconPlay,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import styles from "./landing.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ── Default texts (fallback when admin hasn't customized) ──
// v2 copy — mirrors the VSL arc. Direct, honest, no inflated promises. Every
// claim maps to something the product/founder actually does. DB overrides
// (cfg/sec) still win via t(); these are the defaults the page ships with.
// **bold** markers in copy are rendered as real <strong> via renderBold().
const DEFAULTS = {
  // ── Hero ─────────────────────────────────────────────────────────────
  heroTitle: "Aprende a criar e vender soluções de IA pra empresas.",
  heroSubtitle: "Sem código. Sem gastar um metical em anúncio. Sem promessa furada.",
  heroDesc: "O ecossistema que te entrega a ferramenta que **acha os clientes**, os **scripts que fecham** e a **comunidade que te ensina a construir** — pra você prestar serviço pra empresas em Moçambique e fechar o seu primeiro contrato.",
  heroCtaText: "Quero entrar no Código Zero (497 MT/mês)",
  heroSubCta: "M-Pesa · e-Mola · Cartão · Acesso na hora, direto no teu WhatsApp.",
  ctaText: "Entrar no Código Zero",

  // ── VSL ──────────────────────────────────────────────────────────────
  vslTitle: "Código Zero — Apresentação",
  vslSubtitle: "Assiste à apresentação completa",
  vslHint: "Clica para ouvir",

  // ── O que isso NÃO é ─────────────────────────────────────────────────
  notLabel: "O que isso não é",
  notTitle: "Esquece tudo. Isto aqui é outra coisa.",
  notLines: [
    "Se você já tentou dropshipping, cash on delivery, venda de ebook (o famoso PLR) ou tráfego direto — esquece tudo. Isto aqui é outra coisa.",
    "**Eu não vou te prometer 50 ou 100 mil meticais em algumas semanas.** Não prometo dinheiro fácil, não prometo atalho, não prometo nada que eu não consiga te entregar.",
    "A proposta é simples e honesta: **te ensinar a prestar serviço pra empresas e a criar micro-SaaS usando inteligência artificial.** Você aprende a desenvolver sistemas, sites, automações e agentes que atendem no WhatsApp — e a vender isso pra quem precisa.",
  ],

  // ── Como isso vira dinheiro de verdade (clinic story) ────────────────
  clinicLabel: "Como isso vira dinheiro de verdade",
  clinicTitle: "Pensa numa clínica.",
  clinicParas: [
    "Ela tem 3 funcionários que atendem tudo pelo WhatsApp: agendar consulta, mandar relatório, tirar dúvida. Só que a clínica tem paciente demais, e os 3 não dão conta. O atendimento fica lento. No fim do mês, faturam pouco — e o motivo é exatamente esse: ninguém consegue responder todo mundo a tempo.",
    "Essa clínica precisa de algo que atenda os pacientes **de forma automática**, sem gastar tempo, e que faça o faturamento subir.",
    "É exatamente o que um agente de WhatsApp faz. Ele atende todos os pacientes, economiza tempo, e libera os 3 funcionários pra focar no que importa. No fim do mês a clínica fatura muito mais, gastando pouco.",
    "Agora multiplica isso: clínicas, restaurantes, agências de viagem, imobiliárias — **todo negócio que atende no WhatsApp precisa dessa solução.** E você vai aprender a construir e vender.",
  ],

  // ── Os números, sem inflar ───────────────────────────────────────────
  numbersLabel: "Os números, sem inflar",
  numbersTitle: "Faz a conta com calma.",
  numbersLine1: "No mercado, esse tipo de solução é cobrado entre **200 e 500 reais por mês** — o equivalente a **2.400 a 6.000 MT/mês** — fora a taxa de implementação.",
  numbersLine2: "Faz a conta com calma: **um único contrato de 3.000 MT/mês paga a tua assinatura do Código Zero por mais de 6 meses.** Não preciso te prometer fortuna. Um cliente já vira o jogo.",

  // ── Quem está falando com você (founder) ─────────────────────────────
  founderLabel: "Quem está falando com você",
  founderIntro: "Eu sou o **Ângelo Deixa.** Moçambicano, 20 anos, morando no Brasil, apaixonado por engenharia da computação. No digital eu já construí coisas que mexeram com o negócio de vários empreendedores moçambicanos:",
  founderCreds: [
    "**CMO e sócio da Lojou** — plataforma de venda de infoprodutos que já processou **mais de 2 milhões de meticais.**",
    "**CEO da Kilax** — plataforma de hospedagem de VSLs (vídeos de vendas).",
    "**COO da Klick Builder** — plataforma de domínio e hospedagem, fundada pelo Gastene Felipe, sócio e amigo, empreendedor que você talvez já conheça.",
    "**Sócio da Mira** — startup que tenho com um sócio brasileiro, onde usamos tecnologia pra resolver problema de empresa. O último contrato que fechamos foi de **R$ 20 mil pra desenvolver um e-commerce** — a primeira parcela paga foi de **3.330 reais, mais de 40 mil meticais.**",
  ],
  founderClosing: "Eu não vou te ensinar nada que eu não faça todo dia.",

  // ── O ecossistema por dentro (Stack → 5 features) ────────────────────
  stackLabel: "O ecossistema por dentro",
  stackTitle: "Tudo está",
  stackTitleHighlight: "conectado.",
  stackDesc: "O Código Zero não é \"mais um curso\". É uma plataforma onde tudo está conectado — a mesma conta, o mesmo histórico de leads, a mesma comunidade.",
  ecoFeatures: [
    { emoji: "🛰️", title: "Radar — acha os clientes pra você", desc: "Scanner que varre o Google Maps por **cidade e nicho** e devolve nome, telefone, Instagram e website das empresas. Sem CSV, sem trabalho manual." },
    { emoji: "📤", title: "Disparador — fala com todos de uma vez", desc: "Selecionou os contatos do Radar? Manda a abordagem pra todos eles de uma vez só, dentro da própria plataforma." },
    { emoji: "📑", title: "Scripts — as abordagens que fecham", desc: "Banco de scripts validados pra você usar na hora de entrar em contato pela primeira vez ou fechar o contrato. Você não escreve do zero — copia o que já funciona." },
    { emoji: "🎓", title: "Aulas e lives — aprende a construir e a vender", desc: "Aulas e lives gravadas onde eu e outros mentores ensinamos a **desenvolver as soluções** e, principalmente, a **vendê-las.**" },
    { emoji: "💬", title: "Chat e suporte", desc: "Canal de chat onde os membros trocam ideia dentro da plataforma. E um canal de suporte onde você tira dúvida direto comigo ou com a minha equipe." },
  ],

  // ── Network / Comunidade ─────────────────────────────────────────────
  networkLabel: "A network",
  networkTitle: "A comunidade privada",
  networkTitleHighlight: "onde tudo acontece.",
  networkMembersCount: "222",
  networkMembersLabel: "membros ativos",
  networkDesc: "A comunidade privada onde tudo acontece. No momento, **222 membros ativos** — pessoas como você, que querem vencer e estão construindo de verdade.",
  networkPillars: [
    { title: "Call ao vivo todo domingo", desc: "revisão da semana, problema real, o que está convertendo agora." },
    { title: "Troca real", desc: "membros publicam o que está funcionando: scripts, automações, contratos fechados." },
    { title: "Construção em conjunto", desc: "projetos coletivos de SaaS: alguém começa, a network ajuda a finalizar, quem participa divide." },
    { title: "Irmandade, não audiência", desc: "não é um Discord de 5 mil pessoas mudas. São 222 que se conhecem pelo nome." },
  ],

  // ── Como o Radar funciona (na prática) ───────────────────────────────
  radarLabel: "Como o Radar funciona (na prática)",
  radarTitle: "Os primeiros clientes sem gastar em anúncio.",
  radarSteps: [
    "Você entra na plataforma e clica em **Radar.**",
    "Seleciona o nicho — por exemplo, **clínicas.**",
    "Seleciona as cidades — **Maputo, Quelimane, Chimoio, Inhambane.**",
    "Marca **telefone como obrigatório** e clica em **buscar.**",
    "O sistema traz o máximo de clientes possível, automaticamente.",
    "Vai no **Disparador**, seleciona os contatos e faz o envio — uma única vez.",
  ],
  radarClosing: "É por isso que você **não precisa de dinheiro pra anúncio** pra achar os primeiros clientes. O Radar já faz esse trabalho por você.",

  // ── A oferta (Pricing) ───────────────────────────────────────────────
  scarcityLabel: "A oferta",
  scarcityTitle: "Acesso a tudo por 497 MT/mês.",
  scarcityDesc: "O Código Zero é uma plataforma de assinatura. **497 MT por mês** te dão acesso a tudo: Radar, Disparador, Scripts, aulas, lives, comunidade e suporte.",
  priceFrom: "",
  priceAmount: "497",
  pricePeriod: "MT/mês",
  priceSub: "É mais ou menos o **preço de um hambúrguer.** E tem um motivo pro preço ser esse: **eu não quero ninguém de fora por falta de dinheiro.** Quem quer construir, constrói.",
  priceCtaText: "Garantir minha vaga (497 MT/mês)",

  // ── Close Friends (upsell exibido na pricing section) ──────────────
  closeFriendsLabel: "Close Friends",
  closeFriendsTitle: "Opcional: Close Friends",
  closeFriendsDesc: "Add-on de **1.297 MT**, pagamento único no checkout. Te dá **3 meses corridos** de acesso (em vez de 1), **badge dourado** na conta e **prioridade nas calls de domingo.**",

  // ── Como funciona — do pagamento à primeira call (Flow) ──────────────
  flowLabel: "Como funciona — do pagamento à primeira call",
  flowTitle: "Do pagamento",
  flowTitleHighlight: "à primeira call.",
  flowSteps: [
    { num: "01", title: "Você paga a assinatura", desc: "M-Pesa, e-Mola ou cartão. A página de pagamento já vem pronta — você escolhe o método e finaliza. Aprovação na hora." },
    { num: "02", title: "Recebe o acesso no WhatsApp", desc: "Assim que o pagamento é confirmado, o sistema envia o seu acesso automaticamente, no número que você cadastrou. Em segundos." },
    { num: "03", title: "Entra na network", desc: "Link direto da comunidade privada. Você se apresenta e começa a interagir." },
    { num: "04", title: "Aparece na call de domingo", desc: "Entra no Zoom no horário marcado e começa a executar o método já na semana seguinte." },
  ],

  // ── Garantia ────────────────────────────────────────────────────────
  guaranteeLabel: "Garantia",
  guaranteeTitle: "Sem garantia mirabolante.",
  guaranteeText1: "Eu não vendo sonho, então também não vou inventar garantia mirabolante.",
  guaranteeText2: "",
  guaranteeHighlight: "O que eu te ofereço é o seguinte: **entra, usa o Radar, manda os scripts validados e aparece nas calls.** Se você fizer a tua parte por 30 dias e sentir que a plataforma não te entregou o que prometi, é só pedir — eu devolvo o teu dinheiro, sem drama e sem letra miúda.",
  guaranteeConclusion: "O único risco real que você corre é continuar de fora, vendo os outros fecharem contrato.",
  guaranteeCtaText: "Entrar no Código Zero",

  // ── FAQ ──────────────────────────────────────────────────────────────
  faqLabel: "Perguntas frequentes",
  faqTitle: "O que costumam perguntar.",
  faqItems: [
    { q: "Preciso saber programar?", a: "Não. O Código Zero foi feito pra quem nunca abriu uma IDE. O Radar é por botão, o Disparador é por botão, as aulas te ensinam a usar IAs visuais. Quando aparece código, é só copiar e colar." },
    { q: "Quanto tempo até o primeiro resultado?", a: "Depende de você executar. Quem entra, usa o Radar, dispara os scripts e aparece nas calls, costuma ter conversa real com cliente nos primeiros dias. Fechar contrato é questão de volume e de seguir o método — eu não prometo prazo mágico, prometo o caminho." },
    { q: "O número de WhatsApp que vou usar bloqueia?", a: "Nas aulas eu te mostro exatamente como disparar com segurança pra reduzir esse risco — aquecimento de número, volume certo e abordagem que não parece spam. Feito do jeito que ensino, o risco é baixo." },
    { q: "Cancelar é fácil?", a: "É. É uma assinatura. Se quiser sair, cancela e pronto — sem fidelidade, sem multa, sem ligação de retenção." },
    { q: "Já tentei vender curso de IA e não funcionou. Aqui é diferente?", a: "Aqui você não está comprando \"curso\". Você está entrando num ecossistema que te dá a **ferramenta que acha o cliente**, os **scripts que fecham** e a **comunidade que destrava** quando você trava. A diferença é que aqui tem execução, não só teoria." },
  ],

  // ── CTA final ────────────────────────────────────────────────────────
  finalCtaTitle: "O acesso é imediato. A próxima call é no domingo.",
  finalCtaDesc: "Foi um prazer ter você até aqui. Agora é clicar e dar o próximo passo — eu te espero do outro lado.",
  finalCtaText: "Garantir minha vaga (497 MT/mês)",

  // ── Footer ───────────────────────────────────────────────────────────
  footerDesc: "Código Zero — o ecossistema de tecnologia pra criar micronegócios de IA em Moçambique. Sem código, sem barreiras.",

  // ── Legacy fields (kept for backwards-compat with stored sections JSON) ──
  trustText: "",
  stat1Value: "", stat1Label: "", stat2Value: "", stat2Label: "", stat3Value: "", stat3Label: "",
  stackTools: [],
  painLabel: "", painTitle: "", painTitleHighlight: "", painDesc: "", painItems: [],
  painConclusion: "", painConclusionSub: "",
  solutionLabel: "", solutionTitle: "", solutionTitleHighlight: "", solutionDesc: "", solutionCards: [],
  valueLabel: "", valueTitle: "", valueTitleHighlight: "", valueDesc: "", valueItems: [],
  valueTotalLabel: "", valueTotalAmount: "", valuePunchline: "",
};

// Founder photo gallery — the three real images (replace the placeholder files
// under /public/founders with the actual photos using these exact names; see
// public/founders/README.md). Order: retrato → Instagram → Pix. `area` maps each
// tile to a CSS grid-area (portrait sits tall on the left; ig + pix stack on the
// right; single column on mobile). Each tile carries its own aspect-ratio in CSS
// so the image fills cleanly (object-fit: cover) with no letterboxing. `tag`
// renders a caption chip over the tile.
const FOUNDER_GALLERY = [
  { src: "/founders/angelo.jpg", alt: "Ângelo Deixa, fundador do Código Zero", area: "portrait" as const },
  { src: "/founders/instagram.jpg", alt: "Perfil @eusouangelodeixa no Instagram com 2.625 seguidores", area: "ig" as const, tag: "2.625 seguidores no Instagram" },
  { src: "/founders/pix-3330.jpg", alt: "Comprovante de Pix recebido — primeira parcela de R$ 3.330 do contrato da Mira", area: "pix" as const, tag: "Primeira parcela — R$ 3.330" },
];

/**
 * Renders a copy string with **bold** markers as real <strong> spans (instead
 * of printing literal asterisks). Splits on `**...**` pairs.
 */
function renderBold(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

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
      id: 'situation',
      title: 'Pra começar: o que descreve melhor a tua situação hoje?',
      options: [
        { id: 'A', text: 'Tenho emprego e quero uma renda extra.' },
        { id: 'B', text: 'Sou estudante e quero começar a ganhar o meu próprio dinheiro.' },
        { id: 'C', text: 'Estou desempregado(a) e preciso de uma fonte de renda.' },
        { id: 'D', text: 'Já trabalho por conta / freelance e quero escalar.' }
      ]
    },
    {
      id: 'goal',
      title: 'Qual é a tua meta financeira realista pros próximos 6 meses?',
      options: [
        { id: 'A', text: 'Uma renda extra de 10.000 a 20.000 MT/mês.' },
        { id: 'B', text: 'Substituir a minha renda atual com o digital.' },
        { id: 'C', text: 'Construir um negócio escalável, não só uma renda.' }
      ]
    },
    {
      id: 'driver',
      title: 'O que mais te move a querer isso?',
      options: [
        { id: 'A', text: 'Liberdade — não depender de patrão nem de salário.' },
        { id: 'B', text: 'Dar uma vida melhor pra minha família.' },
        { id: 'C', text: 'Ter segurança e parar de viver no aperto.' },
        { id: 'D', text: 'Construir algo meu, de verdade.' }
      ]
    },
    {
      id: 'objection',
      title: 'Sendo sincero(a): o que mais te trava hoje?',
      options: [
        { id: 'A', text: 'Não sei programar e acho tecnologia complicado demais.' },
        { id: 'B', text: 'Não sei o que vender nem como achar cliente.' },
        { id: 'C', text: 'Não tenho dinheiro pra investir em ferramenta cara.' },
        { id: 'D', text: 'Já tentei outras coisas e me queimei — tenho medo de perder tempo de novo.' },
        { id: 'E', text: 'Falta de tempo no meio da correria.' }
      ]
    },
    {
      id: 'experience',
      title: 'Você já tentou ganhar dinheiro online antes? Como foi?',
      options: [
        { id: 'A', text: 'Nunca tentei — isso é novo pra mim.' },
        { id: 'B', text: 'Tentei afiliado / ebook (PLR) e não rolou.' },
        { id: 'C', text: 'Tentei dropshipping / COD e não rolou.' },
        { id: 'D', text: 'Já presto algum serviço, mas quero estruturar melhor.' },
        { id: 'E', text: 'Já comprei curso de IA e não saiu do papel.' }
      ]
    },
    {
      id: 'budget',
      title: 'Pra começar um negócio que pode te dar retorno, quanto você consegue investir este mês?',
      options: [
        { id: 'A', text: 'Tenho um valor reservado pra investir no que valer a pena.' },
        { id: 'B', text: 'Consigo separar algo pequeno pra começar (tipo o preço de um lanche).' },
        { id: 'C', text: 'Tô bem apertado(a) — todo metical conta agora.' }
      ]
    },
    {
      id: 'urgency',
      title: 'Se isso fizer sentido pra você, quando quer começar?',
      options: [
        { id: 'A', text: 'Agora. Tô pronto pra começar essa semana.' },
        { id: 'B', text: 'Nos próximos dias — quero entender melhor primeiro.' },
        { id: 'C', text: 'Tô só pesquisando, sem pressa.' }
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

  // Diagnóstico copy personalized by the lead's main objection (Q4 `objection`).
  // surveyAnswers.objection holds the full option TEXT, so we match it back to
  // the P4 option to recover its letter (A–E), then look up the angle below.
  const DIAGNOSIS_BY_OBJECTION: Record<string, { title: string; body: string }> = {
    A: {
      title: 'Você não precisa saber programar.',
      body: 'O Código Zero foi feito pra quem nunca abriu uma IDE: Radar e Disparador são por botão, e as aulas te ensinam a usar IAs visuais. No vídeo a seguir eu te mostro exactamente como — sem digitar uma linha de código.',
    },
    B: {
      title: 'O teu maior obstáculo é achar cliente — e é exactamente isso que o Radar resolve.',
      body: 'O Radar varre o Google Maps e te entrega empresas com telefone, Instagram e website prontos pra abordar, sem gastar um metical em anúncio. No vídeo a seguir você vê o Radar a funcionar na prática.',
    },
    C: {
      title: 'Você não precisa de ferramenta cara pra começar.',
      body: 'Tudo está dentro de uma assinatura única, pelo preço de um hambúrguer por mês — e um único contrato já paga vários meses de acesso. No vídeo a seguir eu te mostro como isso fecha a conta.',
    },
    D: {
      title: 'Você já se queimou antes — então deixa eu te mostrar por que aqui é diferente.',
      body: 'Aqui tem método validado, uma comunidade que te destrava quando você trava e garantia de verdade. No vídeo a seguir eu te mostro o ecossistema por dentro, sem promessa furada.',
    },
    E: {
      title: 'Pouco tempo? O sistema faz o trabalho pesado por você.',
      body: 'O Radar acha os clientes e as aulas são gravadas pra você assistir no teu ritmo — dá pra rodar com 1 a 2 horas por dia. No vídeo a seguir eu te mostro como.',
    },
  };
  const DIAGNOSIS_DEFAULT = {
    title: 'Diagnóstico pronto.',
    body: 'Com base nas suas respostas, você tem o perfil certo pro novo modelo de micronegócios de IA em Moçambique. Liberamos um vídeo restrito mostrando os bastidores.',
  };
  const objectionLetter = SURVEY_STEPS.find(s => s.id === 'objection')
    ?.options.find(o => o.text === surveyAnswers.objection)?.id;
  const diagnosis = (objectionLetter && DIAGNOSIS_BY_OBJECTION[objectionLetter]) || DIAGNOSIS_DEFAULT;

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


  // Dynamic arrays with fallbacks (DB override via sec.* still wins).
  const notLines = (sec.notLines || DEFAULTS.notLines) as string[];
  const clinicParas = (sec.clinicParas || DEFAULTS.clinicParas) as string[];
  const founderCreds = (sec.founderCreds || DEFAULTS.founderCreds) as string[];
  const ecoFeatures = (sec.ecoFeatures || DEFAULTS.ecoFeatures) as { emoji: string; title: string; desc: string }[];
  const networkPillars = (sec.networkPillars || DEFAULTS.networkPillars) as { title: string; desc: string }[];
  const radarSteps = (sec.radarSteps || DEFAULTS.radarSteps) as string[];
  const flowSteps = (sec.flowSteps || DEFAULTS.flowSteps) as { num: string; title: string; desc: string }[];
  const faqItems = (sec.faqItems || DEFAULTS.faqItems) as { q: string; a: string }[];

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
                    Aprenda a criar e vender soluções de IA para empresas —{' '}
                    <span className={styles.hookHighlight}>sem digitar uma linha de código.</span>
                  </h1>
                  <p className={styles.hookDesc}>
                    O ecossistema que te entrega a ferramenta, os clientes e o conhecimento pra construir micronegócios de IA em Moçambique.
                  </p>
                  <div className={styles.hookSteps}>
                    <div className={styles.hookStep}>
                      <div className={styles.hookStepNum}>1</div>
                      <div>
                        <strong>Responda 7 perguntas rápidas</strong>
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
            ) : surveyStep <= SURVEY_STEPS.length ? (
              <div key={`step-${surveyStep}`} className={styles.surveyFadeIn}>
                <div className={styles.gateSurveyHeader}>
                  <span className={styles.gateSurveyStep}>PERGUNTA {surveyStep} DE {SURVEY_STEPS.length}</span>
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
                <p className={styles.gateSubtitle} style={{ marginBottom: '8px', fontSize: '15px' }}>
                  <span className={styles.hookHighlight} style={{ fontStyle: 'normal', fontWeight: 700 }}>{diagnosis.title}</span>
                </p>
                <p className={styles.gateSubtitle} style={{ marginBottom: '24px', fontSize: '14px' }}>
                  {diagnosis.body}
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
            <p className={styles.heroSubtitle}>{renderBold(t("heroSubtitle"))}</p>
            <p className={styles.heroDesc}>{renderBold(t("heroDesc"))}</p>
            <div className={styles.heroCtaWrap}>
              <CtaLink className={styles.heroCta}>{t("heroCtaText")}</CtaLink>
              <p className={styles.heroSubCta}>{t("heroSubCta")}</p>
            </div>
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

        {/* O QUE ISSO NÃO É */}
        <section className={styles.section}>
          <motion.div {...reveal} className={styles.notBlock}>
            <span className={styles.sectionLabel}>{t("notLabel")}</span>
            <h2 className={styles.sectionTitle}>{t("notTitle")}</h2>
            <div className={styles.notLines}>
              {notLines.map((line, i) => (
                <p key={i} className={styles.notLine}>{renderBold(line)}</p>
              ))}
            </div>
          </motion.div>
        </section>

        {/* COMO ISSO VIRA DINHEIRO DE VERDADE (clinic story) */}
        <section className={styles.section}>
          <motion.div {...reveal} className={styles.clinicBlock}>
            <span className={styles.sectionLabel}>{t("clinicLabel")}</span>
            <h2 className={styles.clinicTitle}>{t("clinicTitle")}</h2>
            <div className={styles.clinicParas}>
              {clinicParas.map((p, i) => (
                <p key={i} className={styles.clinicPara}>{renderBold(p)}</p>
              ))}
            </div>
          </motion.div>
        </section>

        {/* OS NÚMEROS, SEM INFLAR */}
        <section className={styles.section}>
          <motion.div {...reveal} className={styles.numbersCard}>
            <span className={styles.sectionLabel}>{t("numbersLabel")}</span>
            <h2 className={styles.numbersTitle}>{t("numbersTitle")}</h2>
            <p className={styles.numbersLine}>{renderBold(t("numbersLine1"))}</p>
            <p className={styles.numbersLineHi}>{renderBold(t("numbersLine2"))}</p>
          </motion.div>
        </section>

        {/* QUEM ESTÁ FALANDO COM VOCÊ — founder + galeria */}
        <section className={styles.founderSection}>
          <motion.div {...reveal} className={styles.founderInner}>
            <div className={styles.founderText}>
              <span className={styles.sectionLabel}>{t("founderLabel")}</span>
              <p className={styles.founderIntro}>{renderBold(t("founderIntro"))}</p>
              <ul className={styles.founderCreds}>
                {founderCreds.map((c, i) => (
                  <li key={i} className={styles.founderCred}>
                    <span className={styles.founderCredDot} aria-hidden />
                    <span>{renderBold(c)}</span>
                  </li>
                ))}
              </ul>
              <p className={styles.founderClosing}>{t("founderClosing")}</p>
            </div>

            {/* GALERIA — 3 imagens reais em /public/founders/ (retrato, Instagram,
                Pix). Os arquivos atuais são placeholders; substituir mantendo os
                nomes exatos (ver public/founders/README.md). */}
            <div className={styles.founderGallery}>
              {FOUNDER_GALLERY.map((img, i) => (
                <div
                  key={i}
                  className={`${styles.founderTile} ${
                    img.area === "portrait"
                      ? styles.gPortrait
                      : img.area === "ig"
                        ? styles.gIg
                        : styles.gPix
                  }`}
                >
                  <Image
                    src={img.src}
                    alt={img.alt}
                    fill
                    sizes="(max-width:560px) 100vw, 360px"
                    className={styles.founderImg}
                  />
                  {img.tag && (
                    <span className={styles.founderTileTag}>{img.tag}</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* O ECOSSISTEMA POR DENTRO — 5 features (substitui StackScrolly) */}
        <section id="ferramentas" className={styles.section}>
          <motion.div {...reveal} className={styles.sectionHead}>
            <span className={styles.sectionLabel}>{t("stackLabel")}</span>
            <h2 className={styles.sectionTitle} style={{ marginLeft: "auto", marginRight: "auto" }}>
              {t("stackTitle")}{" "}
              <span className={styles.sectionTitleHighlight}>{t("stackTitleHighlight")}</span>
            </h2>
            <p className={styles.sectionDesc}>{t("stackDesc")}</p>
          </motion.div>

          <div className={styles.ecoGrid}>
            {ecoFeatures.map((f, i) => (
              <motion.div
                key={i}
                className={styles.ecoCard}
                initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className={styles.ecoEmoji} aria-hidden>{f.emoji}</div>
                <h3 className={styles.ecoTitle}>{f.title}</h3>
                <p className={styles.ecoDesc}>{renderBold(f.desc)}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* A NETWORK */}
        <section id="network" className={styles.networkSection}>
          <motion.div {...reveal} className={styles.networkInner}>
            <div className={styles.networkText}>
              <span className={styles.sectionLabel}>{t("networkLabel")}</span>
              <h2 className={styles.sectionTitle}>
                {t("networkTitle")}{" "}
                <span className={styles.sectionTitleHighlight}>{t("networkTitleHighlight")}</span>
              </h2>
              <p className={styles.sectionDesc}>{renderBold(t("networkDesc"))}</p>

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

        {/* COMO O RADAR FUNCIONA (na prática) */}
        <section className={styles.section}>
          <motion.div {...reveal} className={styles.sectionHead}>
            <span className={styles.sectionLabel}>{t("radarLabel")}</span>
            <h2 className={styles.sectionTitle} style={{ marginLeft: "auto", marginRight: "auto" }}>{t("radarTitle")}</h2>
          </motion.div>

          <ol className={styles.radarSteps}>
            {radarSteps.map((step, i) => (
              <motion.li
                key={i}
                className={styles.radarStep}
                initial={reduceMotion ? false : { opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className={styles.radarStepNum}>{i + 1}</span>
                <span className={styles.radarStepText}>{renderBold(step)}</span>
              </motion.li>
            ))}
          </ol>

          <motion.p {...reveal} className={styles.radarClosing}>{renderBold(t("radarClosing"))}</motion.p>
        </section>

        {/* A OFERTA — PRICING + CLOSE FRIENDS */}
        <section id="preco" className={styles.pricingSection}>
          <motion.div {...reveal} className={styles.scarcityBlock}>
            <span className={styles.sectionLabel}>{t("scarcityLabel")}</span>
            <h3 className={styles.scarcityTitle}>{t("scarcityTitle")}</h3>
            <p className={styles.scarcityText}>{renderBold(t("scarcityDesc"))}</p>
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
            <p className={styles.priceSub}>{renderBold(t("priceSub"))}</p>
            <CtaLink className={styles.priceCta}>{t("priceCtaText")}</CtaLink>

            <div className={styles.cfCallout}>
              <span className={styles.cfBadge}>
                <IconStar size={12} fill="currentColor" strokeWidth={0} />
                {t("closeFriendsLabel")}
              </span>
              <h4 className={styles.cfTitle}>{t("closeFriendsTitle")}</h4>
              <p className={styles.cfDesc}>{renderBold(t("closeFriendsDesc"))}</p>
            </div>
          </motion.div>
        </section>

        {/* COMO FUNCIONA — DO PAGAMENTO À PRIMEIRA CALL (FLOW) */}
        <section className={styles.section}>
          <motion.div {...reveal} className={styles.sectionHead}>
            <span className={styles.sectionLabel}>{t("flowLabel")}</span>
            <h2 className={styles.sectionTitle} style={{ marginLeft: "auto", marginRight: "auto" }}>
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

        {/* GARANTIA */}
        <section className={styles.guaranteeSection}>
          <motion.div {...reveal} className={styles.guaranteeCard}>
            <div className={styles.guaranteeShield}>
              <IconShield size={40} strokeWidth={1.5} />
            </div>
            <span className={styles.guaranteeLabel}>{t("guaranteeLabel")}</span>
            <h2 className={styles.guaranteeTitle}>{t("guaranteeTitle")}</h2>
            {t("guaranteeText1") && <p className={styles.guaranteeText}>{renderBold(t("guaranteeText1"))}</p>}
            {t("guaranteeText2") && <p className={styles.guaranteeText}>{renderBold(t("guaranteeText2"))}</p>}
            <p className={styles.guaranteeHighlight}>{renderBold(t("guaranteeHighlight"))}</p>
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

        {/* CTA FINAL */}
        <section className={styles.finalCta}>
          <motion.div {...reveal}>
            <h2 className={styles.finalCtaTitle}>{t("finalCtaTitle")}</h2>
            <p className={styles.finalCtaDesc}>{t("finalCtaDesc")}</p>
            <CtaLink className={styles.heroCta}>{t("finalCtaText")}</CtaLink>
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
