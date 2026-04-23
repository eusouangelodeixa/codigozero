"use client";
import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import styles from "./landing.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// ── Default texts (fallback when admin hasn't customized) ──
const DEFAULTS = {
  heroTitle: "Como gerar os seus primeiros 50.000 MT/mês com Inteligência Artificial",
  heroSubtitle: "Sem digitar uma única linha de código",
  heroDesc: "O ecossistema completo que te entrega a ferramenta, os clientes e o conhecimento para você criar micronegócios lucrativos em Moçambique.",
  ctaText: "Quero Garantir 1 das 50 Vagas Agora",
  trustText: "🔒 Plataforma validada com mais de 2 Milhões de MT já processados.",
  stat1Value: "2M+ MT", stat1Label: "Processados",
  stat2Value: "50", stat2Label: "Vagas",
  stat3Value: "30 dias", stat3Label: "Garantia",
  vslTitle: "Código Zero — Apresentação",
  vslSubtitle: "Assista a apresentação completa",
  vslHint: "Clique para ouvir",
  painLabel: "O Problema",
  painTitle: "O mercado digital antigo exige muito de você.",
  painTitleHighlight: "O jogo mudou.",
  painDesc: "Você sabe que a internet é o caminho, mas provavelmente já travou na execução:",
  painItems: [
    "Tentou vender e-books ou ser afiliado, e ninguém comprou.",
    "Acha que precisa de um computador de última geração.",
    "Pensa que aprender a programar vai levar anos.",
    'Tem vergonha de prospectar clientes e receber "nãos".',
    "Fica preso em cursinhos teóricos que não te dão as ferramentas para trabalhar.",
  ],
  painConclusion: "O seu problema não é falta de vontade. É falta da tecnologia certa.",
  painConclusionSub: "Hoje, donos de negócios não querem saber se você sabe programar. Eles querem soluções. E nós construímos a máquina para você entregar isso.",
  solutionLabel: "A Solução",
  solutionTitle: "Apresentando: O Ecossistema",
  solutionTitleHighlight: "Código Zero",
  solutionDesc: "Muito mais que aulas. Um ambiente de tecnologia que trabalha por você, do primeiro lead ao contrato assinado.",
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
  priceSub: "Você está a apenas 1 cliente de 3.000 MT de empatar meses da sua assinatura",
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
  const [formData, setFormData] = useState({ name: "", phone: "", whatsapp: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("#preco");
  const [cfg, setCfg] = useState<any>({});
  const [sec, setSec] = useState<any>({});

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
            fetch(`${API_URL}/api/landing/lead`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: lead.name, email: lead.email, phone: lead.phone, whatsapp: lead.whatsapp }),
            })
              .then(r => r.json())
              .then(data => {
                if (data.success && data.checkoutUrl) {
                  lead.checkoutUrl = data.checkoutUrl;
                  lead._v = LEAD_VERSION;
                  localStorage.setItem("cz_lead", JSON.stringify(lead));
                  setCheckoutUrl(data.checkoutUrl);
                }
              })
              .catch(() => {});
          } else {
            setCheckoutUrl(lead.checkoutUrl);
          }
          setGateOpen(false);
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
    const leadRecord: Record<string, string> = { ...formData, savedAt: new Date().toISOString(), _v: LEAD_VERSION };
    localStorage.setItem("cz_lead", JSON.stringify(leadRecord));
    try {
      const res = await fetch(`${API_URL}/api/landing/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const handleCheckoutClick = (e: React.MouseEvent) => {
    if (!checkoutUrl || checkoutUrl === "#preco" || checkoutUrl === "#") {
      e.preventDefault();
      scrollTo("preco");
    }
  };

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
            <Logo size={40} />
            <h2 className={styles.gateTitle}>Bem-vindo ao Código Zero</h2>
            <p className={styles.gateSubtitle}>Preencha seus dados para acessar a apresentação completa.</p>
            <form className={styles.gateForm} onSubmit={handleGateSubmit}>
              <input className={styles.gateInput} placeholder="Seu nome completo" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              <input className={styles.gateInput} placeholder="Seu melhor e-mail" type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
              <input className={styles.gateInput} placeholder="Telefone (opcional)" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
              <input className={styles.gateInput} placeholder="WhatsApp (opcional)" value={formData.whatsapp} onChange={e => setFormData({ ...formData, whatsapp: e.target.value })} />
              <button className={styles.gateBtn} type="submit" disabled={submitting}>
                {submitting ? "Processando..." : "Acessar Apresentação"}
              </button>
            </form>
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
            <div className={styles.navLinks}>
              <button onClick={() => scrollTo("problema")} className={styles.navLink}>O Problema</button>
              <button onClick={() => scrollTo("solucao")} className={styles.navLink}>A Solução</button>
              <button onClick={() => scrollTo("conteudo")} className={styles.navLink}>Conteúdo</button>
              <button onClick={() => scrollTo("preco")} className={styles.navLink}>Preço</button>
            </div>
            <div className={styles.navRight}>
              <span className={styles.navVagas}>
                <span className={styles.navVagasDot} />
                Vagas Abertas
              </span>
              <button onClick={() => scrollTo("preco")} className={styles.navCta}>Garantir Vaga</button>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroTags}>
              <span className={styles.heroTag}><span className={styles.heroTagDot} /> Vagas Abertas</span>
              <span className={styles.heroTag}>⚡ Turma 1</span>
              <span className={styles.heroTag}>🛡️ Risco Zero</span>
            </div>

            <h1 className={styles.heroTitle}>
              {t("heroTitle").replace("Inteligência Artificial", "").trim()}{" "}
              <span className={styles.heroHighlight}>Inteligência Artificial</span>
            </h1>
            <p className={styles.heroSubtitle}>{t("heroSubtitle")}</p>
            <p className={styles.heroDesc}>{t("heroDesc")}</p>

            <button onClick={() => scrollTo("preco")} className={styles.ctaPrimary}>{t("ctaText")}</button>
            <p className={styles.heroTrust}>{t("trustText")}</p>

            <div className={styles.heroStats}>
              <div className={styles.heroStat}><span className={styles.heroStatValue}>{t("stat1Value")}</span><span className={styles.heroStatLabel}>{t("stat1Label")}</span></div>
              <div className={styles.heroStat}><span className={styles.heroStatValue}>{t("stat2Value")}</span><span className={styles.heroStatLabel}>{t("stat2Label")}</span></div>
              <div className={styles.heroStat}><span className={styles.heroStatValue}>{t("stat3Value")}</span><span className={styles.heroStatLabel}>{t("stat3Label")}</span></div>
            </div>
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
                  style={{ width: "100%", position: "relative" }}
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
          <p className={styles.sectionDesc}>{t("painDesc")}</p>
          <div className={styles.painGrid}>
            {painItems.map((item, i) => (
              <div key={i} className={styles.painItem}>
                <span className={styles.painX}>✕</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <div className={styles.painConclusion}>
            <p className={styles.painConclusionText}>{t("painConclusion")}</p>
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
          <p className={styles.sectionDesc}>{t("solutionDesc")}</p>
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
            <a href={checkoutUrl} onClick={handleCheckoutClick} className={styles.priceCta}>
              {t("priceCtaText")}
            </a>
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
            <a href={checkoutUrl} onClick={handleCheckoutClick} className={styles.guaranteeCta}>
              {t("guaranteeCtaText")}
            </a>
          </div>
        </section>

        {/* FOOTER */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div>
              <div className={styles.footerLogo}><Logo size={20} /><span className={styles.footerBrand}>Código Zero</span></div>
              <p className={styles.footerDesc}>{t("footerDesc")}</p>
            </div>
            <div>
              <h4 className={styles.footerColTitle}>Links</h4>
              <div className={styles.footerLinks}>
                <button onClick={() => scrollTo("problema")} className={styles.footerLink}>O Problema</button>
                <button onClick={() => scrollTo("solucao")} className={styles.footerLink}>A Solução</button>
                <button onClick={() => scrollTo("conteudo")} className={styles.footerLink}>Conteúdo</button>
                <button onClick={() => scrollTo("preco")} className={styles.footerLink}>Preço</button>
                <a href="/login" className={styles.footerLink}>Área de Membros</a>
              </div>
            </div>
            <div>
              <h4 className={styles.footerColTitle}>Legal</h4>
              <div className={styles.footerLinks}>
                <a href="#" className={styles.footerLink}>Termos de Uso</a>
                <a href="#" className={styles.footerLink}>Privacidade</a>
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
