"use client";
import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import styles from "./landing.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ── Default texts (fallback when admin hasn't customized) ──
const DEFAULTS = {
  heroTitle: "Como gerar os seus primeiros 50.000 MT/mês com Inteligência Artificial",
  heroSubtitle: "Sem digitar uma única linha de código",
  heroDesc: "O ecossistema que te entrega a tecnologia, os clientes e o método exato para <strong>fechares contratos B2B de 3.000 MT recorrentes</strong>, conquistando a liberdade de trabalhar a partir de casa apenas com um computador simples em Moçambique.",
  ctaText: "Entrar no Codigo Zero",
  trustText: "🚀 O atalho definitivo para conquistares a tua independência financeira sem precisares de saber programar.",
  stat1Value: "2M+ MT", stat1Label: "Processados",
  stat2Value: "50", stat2Label: "Vagas",
  stat3Value: "30 dias", stat3Label: "Garantia",
  vslTitle: "Código Zero — Apresentação",
  vslSubtitle: "Assista a apresentação completa",
  vslHint: "Clique para ouvir",
  painLabel: "O Problema",
  painTitle: "O mercado digital antigo exige muito de você.",
  painTitleHighlight: "O jogo mudou.",
  painDesc: "Você sabe que a internet é o veículo para não ficar estagnado, mas provavelmente já travou na execução e <strong>vê o dinheiro desaparecer rápido todos os meses</strong>:",
  painItems: [
    "Consome horas no TikTok/YouTube sobre Marketing Digital, mas <strong>nunca aplica nem monetiza nada</strong>.",
    "Tenta vender e-books para pessoas comuns e frustra-se com <strong>vácuos ou respostas negativas</strong>.",
    "Fica paralisado pela <strong>síndrome do impostor</strong>, achando que precisa ser um génio da programação.",
    "Fica preso em cursinhos teóricos que só vendem teorias, mas <strong>nunca entregam as ferramentas</strong>.",
    "Sente que está a ser <strong>engolido pela revolução tecnológica</strong> enquanto outros prosperam.",
  ],
  painConclusion: "O seu problema não é falta de vontade. É tentar vender a <strong>quem não tem poder de compra</strong>, usando os métodos errados.",
  painConclusionSub: "Hoje, donos de negócios não querem saber se você sabe programar. Eles querem soluções. E nós construímos a máquina para você entregar isso.",
  solutionLabel: "A Solução",
  solutionTitle: "Apresentando: O Ecossistema",
  solutionTitleHighlight: "Código Zero",
  solutionDesc: "Donos de negócios não querem saber se sabes programar — <strong>eles pagam por quem resolve os problemas deles</strong>. Apresentamos a máquina que faz isso por ti, do primeiro lead ao contrato assinado.",
  solutionCards: [
    { title: "Prospecção no Piloto Automático", desc: "Nosso Scraper varre a internet e te entrega o contato de empresas prontas para comprar. Sem pesquisa manual, sem perda de tempo." },
    { title: "O Que Falar — Scripts Validados", desc: "Acesso imediato ao nosso banco com mensagens de WhatsApp de alta conversão. É só copiar, colar e enviar." },
    { title: "O Que Entregar — Zero Código", desc: "Aulas práticas mostrando como criar SaaS, landing pages e automações em minutos usando IAs visuais." },
    { title: "O Acompanhamento", desc: "Mentorias semanais ao vivo e uma comunidade no Discord para você nunca travar." },
  ],
  valueLabel: "O que está incluído",
  valueTitle: "Tudo o que você precisa em",
  valueTitleHighlight: "uma única infraestrutura.",
  valueDesc: "Se você fosse assinar essas ferramentas e consultorias separadamente, este seria o custo:",
  valueItems: [
    { name: "Acesso ao Scraper de Leads Ilimitado", value: "5.000 MT/mês" },
    { name: "Banco de Scripts e Prompts Profissionais", value: "4.500 MT" },
    { name: "Treinamento Prático: Do Zero ao Deploy (4 Módulos)", value: "7.000 MT" },
    { name: "Mentorias ao Vivo Semanais Direto da Trincheira", value: "10.000 MT/mês" },
    { name: "Acesso à Comunidade Fechada (Networking)", value: "2.000 MT" },
  ],
  valueTotalLabel: "Valor Total do Ecossistema",
  valueTotalAmount: "28.500 MT",
  valuePunchline: "Mas você não vai pagar isso hoje.",
  scarcityLabel: "Escassez Real",
  scarcityTitle: "Por que apenas 50 vagas para a Turma 1?",
  scarcityDesc: "Nós levamos tecnologia a sério. O nosso Scraper de leads exige alta capacidade de processamento dos nossos servidores para rodar rápido para todos. Para garantir que o sistema não fique lento, a trava de segurança bloqueará novos cadastros assim que 50 pagamentos forem confirmados.",
  priceFrom: "28.500 MT",
  priceAmount: "797",
  pricePeriod: "MT/mês",
  priceSub: "O seu primeiro passo para conquistar a segurança de um negócio digital próprio e trabalhar de onde quiser.",
  priceCtaText: "Garantir Minha Vaga (797 MT)",
  guaranteeLabel: "Garantia Condicional",
  guaranteeTitle: "Risco Zero Absoluto",
  guaranteeText1: "Eu confio tanto na tecnologia que construí que vou colocar todo o risco nas minhas costas.",
  guaranteeText2: "Entre no Código Zero. Use o nosso Scraper de Leads e envie os scripts validados do nosso banco por 30 dias.",
  guaranteeHighlight: "Se você fizer isso e não fechar pelo menos 1 contrato de 3.000 MT, eu não apenas devolvo 100% do seu dinheiro em dobro, como também te dou 1 hora de consultoria individual totalmente de graça para consertarmos o seu negócio.",
  guaranteeConclusion: "O único risco que você corre é ficar de fora.",
  guaranteeCtaText: "Aceitar o Desafio e Entrar no Código Zero",
  footerDesc: "O ecossistema de tecnologia para criar micronegócios de IA em Moçambique. Sem código, sem barreiras.",
};

export default function LandingPage() {
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
              body: JSON.stringify({ name: lead.name, email: lead.email, phone: lead.phone, whatsapp: lead.whatsapp }),
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
              const fallbackUrl = new URL("https://pay.lojou.app/p/uoEHz");
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
      surveyAnswers
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
  const painItems = (sec.painItems || DEFAULTS.painItems) as string[];
  const solutionCards = (sec.solutionCards || DEFAULTS.solutionCards) as { title: string; desc: string }[];
  const valueItems = (sec.valueItems || DEFAULTS.valueItems) as { name: string; value: string }[];

  const solutionIcons = [
    <svg key={0} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 12L12 3" /><path d="M12 12L19.5 16.5" /><circle cx="12" cy="12" r="3" /></svg>,
    <svg key={1} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M3 9h18" /></svg>,
    <svg key={2} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
    <svg key={3} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>,
  ];

  return (
    <>
      {/* Gate */}
      {gateOpen === null && (
        <div className={styles.gate}><div className={styles.gateInner}><Logo size={32} /><p style={{ color: "#888", marginTop: 12 }}>Carregando...</p></div></div>
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
              <Logo size={24} />
              <span className={styles.navBrand}>Código Zero</span>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>
              {t("heroTitle").replace("Inteligência Artificial", "").trim()}{" "}
              <span className={styles.heroHighlight}>Inteligência Artificial</span>
            </h1>
            <p className={styles.heroSubtitle}>{t("heroSubtitle")}</p>
            <p className={styles.heroDesc} dangerouslySetInnerHTML={{ __html: t("heroDesc") }} />
          </div>

          {/* VSL */}
          <div className={styles.heroMedia}>
            <div className={styles.vslWrapper}>
              <div className={styles.vslBar}>
                <span className={`${styles.vslDot} ${styles.vslDotR}`} />
                <span className={`${styles.vslDot} ${styles.vslDotY}`} />
                <span className={`${styles.vslDot} ${styles.vslDotG}`} />
                <span className={styles.vslBarTitle}>{t("vslTitle")}</span>
              </div>
              
              {cfg.vslEmbedHtml ? (
                <div
                  className={styles.vslEmbed}
                  dangerouslySetInnerHTML={{ __html: cfg.vslEmbedHtml }}
                />
              ) : (
                <div className={styles.vslPlaceholder}>
                  <div className={styles.vslPlayBtn}>
                    <svg width="28" height="28" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                  </div>
                  <p className={styles.vslText}>{t("vslSubtitle")}</p>
                  <p className={styles.vslHint}>{t("vslHint")}</p>
                </div>
              )}
            </div>

          </div>
        </section>

        {/* PAIN */}
        <section id="problema" className={styles.section}>
          <span className={styles.sectionLabel}>{t("painLabel")}</span>
          <h2 className={styles.sectionTitle}>
            {t("painTitle")}{" "}
            <span className={styles.sectionTitleHighlight}>{t("painTitleHighlight")}</span>
          </h2>
          <p className={styles.sectionDesc} dangerouslySetInnerHTML={{ __html: t("painDesc") }} />
          <div className={styles.painGrid}>
            {painItems.map((item, i) => (
              <div key={i} className={styles.painItem}>
                <span className={styles.painX}>✕</span>
                <span dangerouslySetInnerHTML={{ __html: item }} />
              </div>
            ))}
          </div>
          <div className={styles.painConclusion}>
            <p className={styles.painConclusionText} dangerouslySetInnerHTML={{ __html: t("painConclusion") }} />
            <p className={styles.painConclusionSub}>{t("painConclusionSub")}</p>
          </div>
        </section>

        {/* SOLUTION */}
        <section id="solucao" className={styles.section}>
          <span className={styles.sectionLabel}>{t("solutionLabel")}</span>
          <h2 className={styles.sectionTitle}>
            {t("solutionTitle")}{" "}
            <span className={styles.sectionTitleHighlight}>{t("solutionTitleHighlight")}</span>
          </h2>
          <p className={styles.sectionDesc} dangerouslySetInnerHTML={{ __html: t("solutionDesc") }} />
          <div className={styles.solutionGrid}>
            {solutionCards.map((card, i) => (
              <div key={i} className={styles.solutionCard}>
                <div className={styles.solutionIcon}>{solutionIcons[i] || solutionIcons[0]}</div>
                <h3 className={styles.solutionTitle}>{card.title}</h3>
                <p className={styles.solutionText}>{card.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* VALUE STACK */}
        <section id="conteudo" className={styles.section}>
          <span className={styles.sectionLabel}>{t("valueLabel")}</span>
          <h2 className={styles.sectionTitle}>
            {t("valueTitle")}{" "}
            <span className={styles.sectionTitleHighlight}>{t("valueTitleHighlight")}</span>
          </h2>
          <p className={styles.sectionDesc}>{t("valueDesc")}</p>
          <div className={styles.stackGrid}>
            {valueItems.map((item, i) => (
              <div key={i} className={styles.stackItem}>
                <div className={styles.stackCheck}>✓</div>
                <span className={styles.stackName}>{item.name}</span>
                <span className={styles.stackValue}>{item.value}</span>
              </div>
            ))}
            <div className={styles.stackTotal}>
              <span>{t("valueTotalLabel")}</span>
              <span className={styles.stackTotalValue}>{t("valueTotalAmount")}</span>
            </div>
            <p className={styles.stackPunchline}>{t("valuePunchline")}</p>
          </div>
        </section>

        {/* PRICING */}
        <section id="preco" className={styles.pricingSection}>
          <div className={styles.scarcityBlock}>
            <span className={styles.sectionLabel}>{t("scarcityLabel")}</span>
            <h3 className={styles.scarcityTitle}>{t("scarcityTitle")}</h3>
            <p className={styles.scarcityText}>{t("scarcityDesc")}</p>
          </div>
          <div className={styles.pricingCard}>
            <p className={styles.priceFrom}>
              De <span className={styles.priceOld}>{t("priceFrom")}</span> por apenas:
            </p>
            <div className={styles.priceBig}>
              {t("priceAmount")} <span className={styles.priceAccent}>{t("pricePeriod")}</span>
            </div>
            <p className={styles.priceSub}>{t("priceSub")}</p>
            <CtaLink className={styles.priceCta}>
              {t("priceCtaText")}
            </CtaLink>
          </div>
        </section>

        {/* GUARANTEE */}
        <section className={styles.guaranteeSection}>
          <div className={styles.guaranteeCard}>
            <div className={styles.guaranteeShield}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span className={styles.guaranteeLabel}>{t("guaranteeLabel")}</span>
            <h2 className={styles.guaranteeTitle}>{t("guaranteeTitle")}</h2>
            <p className={styles.guaranteeText}>{t("guaranteeText1")}</p>
            <p className={styles.guaranteeText}>{t("guaranteeText2")}</p>
            <p className={styles.guaranteeHighlight}>{t("guaranteeHighlight")}</p>
            <p className={styles.guaranteeConclusion}>{t("guaranteeConclusion")}</p>
            <CtaLink className={styles.guaranteeCta}>
              {t("guaranteeCtaText")}
            </CtaLink>
          </div>
        </section>

        {/* FOOTER */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div>
              <div className={styles.footerLogo}><Logo size={20} /><span className={styles.footerBrand}>Código Zero</span></div>
              <p className={styles.footerDesc}>{t("footerDesc")}</p>
              <a href="https://www.instagram.com/ocodigozero_/" target="_blank" rel="noopener noreferrer" className={styles.footerLink} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="5" /><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" /></svg>
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
