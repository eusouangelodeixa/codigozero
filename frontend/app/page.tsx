"use client";
import React, { useState, useEffect } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import {
  ChevronDown as IconChevron,
  Instagram as IconInstagram,
  Play as IconPlay,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import styles from "./landing.module.css";
import { LANDING_DEFAULTS as DEFAULTS } from "./landingDefaults";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";


// Founder credibility shots (square portrait on the left; Instagram + Pix
// stacked on the right; single column on mobile). These are SCREENSHOTS, so each
// tile's aspect-ratio in CSS matches the image's real proportions — they show in
// FULL, no cropping, no black bars. Replace the placeholder files under
// /public/founders keeping these exact names (see public/founders/README.md).
const FOUNDER_GALLERY = {
  portrait: { src: "/founders/angelo.jpg", alt: "Ângelo Deixa, fundador do Código Zero" },
  ig: { src: "/founders/instagram.jpg", alt: "Perfil @eusouangelodeixa no Instagram" },
  pix: { src: "/founders/pix-3330.jpg", alt: "Comprovante de Pix — primeira parcela de R$ 3.330 do contrato da Mira" },
};

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

  // Renders the CTA correctly: real link when we have a checkout URL, scroll button otherwise.
  // NÃO usar target="_blank": navegadores in-app (Instagram/WhatsApp/Facebook) — de onde vem
  // a maior parte do tráfego mobile — frequentemente ignoram a abertura de nova aba, e o clique
  // "não faz nada". Navegar na mesma aba funciona em todos (incluindo webviews in-app) e mantém
  // o histórico (botão voltar) intacto.
  const CtaLink = ({ className, children }: { className: string; children: React.ReactNode }) =>
    hasCheckout ? (
      <a href={checkoutUrl} className={className}
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
  const founderCreds = (sec.founderCreds || DEFAULTS.founderCreds) as string[];
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
        {/* HERO */}
        <section className={styles.hero}>
          <motion.div className={styles.heroContent} {...reveal}>
            <h1 className={styles.heroTitle}>{t("heroTitle")}</h1>
            <p className={styles.heroSubtitle}>{renderBold(t("heroSubtitle"))}</p>
          </motion.div>

          {/* VSL */}
          <motion.div
            className={styles.heroMedia}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* VSL solta — sem o container/barra de "navegador" (modelo DR) */}
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
          </motion.div>
        </section>

        {/* QUEM ESTÁ FALANDO COM VOCÊ — founder + galeria */}
        <section className={styles.founderSection}>
          <motion.div {...reveal} className={styles.founderInner}>
            <span className={styles.sectionLabel}>{t("founderLabel")}</span>

            {/* Identidade — retrato + apresentação (logo abaixo do título) */}
            <div className={styles.founderHeader}>
              <figure className={styles.founderPhoto}>
                <Image
                  src={FOUNDER_GALLERY.portrait.src}
                  alt={FOUNDER_GALLERY.portrait.alt}
                  width={886}
                  height={886}
                  className={styles.founderPhotoImg}
                />
              </figure>
              <div className={styles.founderHeaderText}>
                <p className={styles.founderIntro}>{renderBold(t("founderIntro"))}</p>
                <figure className={styles.founderProof}>
                  <Image
                    src={FOUNDER_GALLERY.ig.src}
                    alt={FOUNDER_GALLERY.ig.alt}
                    width={1179}
                    height={747}
                    className={styles.founderProofImg}
                  />
                </figure>
              </div>
            </div>

            {/* Credenciais */}
            <ul className={styles.founderCreds}>
              {founderCreds.map((c, i) => (
                <li key={i} className={styles.founderCred}>
                  <span className={styles.founderCredDot} aria-hidden />
                  <span>{renderBold(c)}</span>
                </li>
              ))}
            </ul>

            {/* Prova do contrato da Mira — citado na última credencial (R$ 3.330) */}
            <figure className={`${styles.founderProof} ${styles.founderProofWide}`}>
              <Image
                src={FOUNDER_GALLERY.pix.src}
                alt={FOUNDER_GALLERY.pix.alt}
                width={996}
                height={388}
                className={styles.founderProofImg}
              />
              <figcaption className={styles.founderProofCap}>
                Comprovante da 1ª parcela — <strong>R$ 3.330</strong> (contrato da Mira).
              </figcaption>
            </figure>

            <p className={styles.founderClosing}>{t("founderClosing")}</p>
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

        {/* FOOTER — minimalista */}
        <footer className={styles.footer}>
          <div className={styles.footerMinimal}>
            <Logo size={22} />
            <nav className={styles.footerLinksRow}>
              <a href="/login" className={styles.footerLink}>Área de Membros</a>
              <a href="/termos" className={styles.footerLink}>Termos</a>
              <a href="/privacidade" className={styles.footerLink}>Privacidade</a>
              <a href="https://www.instagram.com/ocodigozero_/" target="_blank" rel="noopener noreferrer" className={styles.footerLink} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <IconInstagram size={15} strokeWidth={1.5} />@ocodigozero_
              </a>
            </nav>
            <span className={styles.footerCopy}>© {new Date().getFullYear()} Código Zero</span>
          </div>
        </footer>
      </div>
      )}
    </>
  );
}
