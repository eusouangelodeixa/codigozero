"use client";
import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import styles from "./landing.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function LandingPage() {
  // Start as null = "loading/checking", true = show gate, false = hide gate
  const [gateOpen, setGateOpen] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", whatsapp: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("#preco");

  // Check localStorage on mount — if lead exists, skip gate entirely
  // Version flag ensures old cached URLs (without plan_id) get refreshed
  const LEAD_VERSION = "v2";

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cz_lead");
      if (saved) {
        const lead = JSON.parse(saved);
        if (lead.name && lead.email) {
          // If old version or missing checkoutUrl, re-submit to get fresh URL
          if (lead._v !== LEAD_VERSION || !lead.checkoutUrl) {
            // Re-fetch checkout with plan_id
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

    // ALWAYS save to localStorage first so the user never has to fill in again
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

  return (
    <>
      {/* While checking localStorage, show nothing (prevents flash) */}
      {gateOpen === null && (
        <div className={styles.gate}>
          <div className={styles.gateInner}>
            <div className={styles.gateLogo}><Logo size={48} /></div>
          </div>
        </div>
      )}

      {/* ═══════════ GATE FORM ═══════════ */}
      {gateOpen === true && (
        <div className={styles.gate}>
          <div className={styles.gateInner}>
            <div className={styles.gateLogo}><Logo size={48} /></div>
            <h1 className={styles.gateTitle}>Código Zero</h1>
            <p className={styles.gateDesc}>
              Preencha seus dados para acessar a apresentação e garantir sua vaga na Turma 1.
            </p>
            <form onSubmit={handleGateSubmit} className={styles.gateForm}>
              <div>
                <label className={styles.gateLabel}>Nome completo *</label>
                <input type="text" required placeholder="Seu nome completo"
                  className={styles.gateInput} value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className={styles.gateLabel}>E-mail *</label>
                <input type="email" required placeholder="seu@email.com"
                  className={styles.gateInput} value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div>
                <label className={styles.gateLabel}>Telefone</label>
                <input type="tel" placeholder="+258 84 000 0000"
                  className={styles.gateInput} value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div>
                <label className={styles.gateLabel}>WhatsApp</label>
                <input type="tel" placeholder="+258 84 000 0000"
                  className={styles.gateInput} value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })} />
              </div>
              <button type="submit" className={styles.gateSubmit} disabled={submitting}>
                {submitting ? (
                  <span className={styles.gateDots}><span /><span /><span /></span>
                ) : "Acessar Apresentação →"}
              </button>
              <p className={styles.gateFooter}>
                🔒 Seus dados estão seguros e não serão compartilhados.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ LANDING PAGE ═══════════ */}
      <div className={styles.landing}>

        {/* ── NAV ── */}
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

        {/* ══════════════════════════════════════
            HERO SECTION — Single column: text → CTA → stats → VSL
        ══════════════════════════════════════ */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div className={styles.heroTags}>
              <span className={styles.heroTag}>
                <span className={styles.heroTagDot} /> Vagas Abertas
              </span>
              <span className={styles.heroTag}>⚡ Turma 1</span>
              <span className={styles.heroTag}>🛡️ Risco Zero</span>
            </div>

            <h1 className={styles.heroTitle}>
              Como gerar os seus primeiros 50.000 MT/mês com{" "}
              <span className={styles.heroHighlight}>Inteligência Artificial</span>
            </h1>
            <p className={styles.heroSubtitle}>
              Sem digitar uma única linha de código
            </p>
            <p className={styles.heroDesc}>
              O ecossistema completo que te entrega a ferramenta, os clientes e o conhecimento 
              para você criar micronegócios lucrativos em Moçambique.
            </p>

            <button onClick={() => scrollTo("preco")} className={styles.ctaPrimary}>
              Quero Garantir 1 das 50 Vagas Agora
            </button>
            <p className={styles.heroTrust}>
              🔒 Plataforma validada com mais de 2 Milhões de MT já processados.
            </p>

            <div className={styles.heroStats}>
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>2M+ MT</span>
                <span className={styles.heroStatLabel}>Processados</span>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>50</span>
                <span className={styles.heroStatLabel}>Vagas</span>
              </div>
              <div className={styles.heroStat}>
                <span className={styles.heroStatValue}>30 dias</span>
                <span className={styles.heroStatLabel}>Garantia</span>
              </div>
            </div>
          </div>

          {/* VSL Video — below text content */}
          <div className={styles.heroMedia}>
            <div className={styles.vslWrapper}>
              <div className={styles.vslBar}>
                <span className={`${styles.vslDot} ${styles.vslDotR}`} />
                <span className={`${styles.vslDot} ${styles.vslDotY}`} />
                <span className={`${styles.vslDot} ${styles.vslDotG}`} />
                <span className={styles.vslBarTitle}>Código Zero — Apresentação</span>
              </div>
              {/* Replace with Kilax embed: <iframe src="..." style={{width:'100%',aspectRatio:'16/9',border:'none'}} /> */}
              <div className={styles.vslPlaceholder}>
                <div className={styles.vslPlayBtn}>
                  <svg width="28" height="28" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                </div>
                <p className={styles.vslText}>Assista a apresentação completa</p>
                <p className={styles.vslHint}>Clique para ouvir</p>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
            A DOR E O VEÍCULO ANTIGO
        ══════════════════════════════════════ */}
        <section id="problema" className={styles.section}>
          <span className={styles.sectionLabel}>O Problema</span>
          <h2 className={styles.sectionTitle}>
            O mercado digital antigo exige muito de você.{" "}
            <span className={styles.sectionTitleHighlight}>O jogo mudou.</span>
          </h2>
          <p className={styles.sectionDesc}>
            Você sabe que a internet é o caminho, mas provavelmente já travou na execução:
          </p>

          <div className={styles.painGrid}>
            {[
              "Tentou vender e-books ou ser afiliado, e ninguém comprou.",
              "Acha que precisa de um computador de última geração.",
              "Pensa que aprender a programar vai levar anos.",
              "Tem vergonha de prospectar clientes e receber \"nãos\".",
              "Fica preso em cursinhos teóricos que não te dão as ferramentas para trabalhar.",
            ].map((item, i) => (
              <div key={i} className={styles.painItem}>
                <span className={styles.painX}>✕</span>
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className={styles.painConclusion}>
            <p className={styles.painConclusionText}>
              O seu problema <strong>não é falta de vontade.</strong> É falta da tecnologia certa.
            </p>
            <p className={styles.painConclusionSub}>
              Hoje, donos de negócios não querem saber se você sabe programar. 
              Eles querem <strong>soluções</strong>. E nós construímos a máquina para você entregar isso.
            </p>
          </div>
        </section>

        {/* ══════════════════════════════════════
            A SOLUÇÃO E A VITÓRIA RÁPIDA
        ══════════════════════════════════════ */}
        <section id="solucao" className={styles.section}>
          <span className={styles.sectionLabel}>A Solução</span>
          <h2 className={styles.sectionTitle}>
            Apresentando: O Ecossistema{" "}
            <span className={styles.sectionTitleHighlight}>Código Zero</span>
          </h2>
          <p className={styles.sectionDesc}>
            Muito mais que aulas. Um ambiente de tecnologia que trabalha por você, 
            do primeiro lead ao contrato assinado.
          </p>

          <div className={styles.solutionGrid}>
            <div className={styles.solutionCard}>
              <div className={styles.solutionIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" /><path d="M12 12L12 3" /><path d="M12 12L19.5 16.5" /><circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <h3 className={styles.solutionTitle}>Prospecção no Piloto Automático</h3>
              <p className={styles.solutionText}>
                Nosso Scraper varre a internet e te entrega o contato de empresas prontas para comprar. 
                Sem pesquisa manual, sem perda de tempo.
              </p>
            </div>

            <div className={styles.solutionCard}>
              <div className={styles.solutionIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M3 9h18" />
                </svg>
              </div>
              <h3 className={styles.solutionTitle}>O Que Falar — Scripts Validados</h3>
              <p className={styles.solutionText}>
                Acesso imediato ao nosso banco com mensagens de WhatsApp de alta conversão. 
                É só copiar, colar e enviar.
              </p>
            </div>

            <div className={styles.solutionCard}>
              <div className={styles.solutionIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3 className={styles.solutionTitle}>O Que Entregar — Zero Código</h3>
              <p className={styles.solutionText}>
                Aulas práticas mostrando como criar SaaS, landing pages e automações 
                em minutos usando IAs visuais.
              </p>
            </div>

            <div className={styles.solutionCard}>
              <div className={styles.solutionIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
              </div>
              <h3 className={styles.solutionTitle}>O Acompanhamento</h3>
              <p className={styles.solutionText}>
                Mentorias semanais ao vivo e uma comunidade no Discord 
                para você nunca travar.
              </p>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════
            EMPILHAMENTO DE VALOR
        ══════════════════════════════════════ */}
        <section id="conteudo" className={styles.section}>
          <span className={styles.sectionLabel}>O que está incluído</span>
          <h2 className={styles.sectionTitle}>
            Tudo o que você precisa em{" "}
            <span className={styles.sectionTitleHighlight}>uma única infraestrutura.</span>
          </h2>
          <p className={styles.sectionDesc}>
            Se você fosse assinar essas ferramentas e consultorias separadamente, 
            este seria o custo:
          </p>

          <div className={styles.stackGrid}>
            {[
              { name: "Acesso ao Scraper de Leads Ilimitado", value: "5.000 MT/mês" },
              { name: "Banco de Scripts e Prompts Profissionais", value: "4.500 MT" },
              { name: "Treinamento Prático: Do Zero ao Deploy (4 Módulos)", value: "7.000 MT" },
              { name: "Mentorias ao Vivo Semanais Direto da Trincheira", value: "10.000 MT/mês" },
              { name: "Acesso à Comunidade Fechada (Networking)", value: "2.000 MT" },
            ].map((item, i) => (
              <div key={i} className={styles.stackItem}>
                <div className={styles.stackCheck}>✓</div>
                <span className={styles.stackName}>{item.name}</span>
                <span className={styles.stackValue}>{item.value}</span>
              </div>
            ))}
            <div className={styles.stackTotal}>
              <span>Valor Total do Ecossistema</span>
              <span className={styles.stackTotalValue}>28.500 MT</span>
            </div>
            <p className={styles.stackPunchline}>Mas você não vai pagar isso hoje.</p>
          </div>
        </section>

        {/* ══════════════════════════════════════
            ESCASSEZ + PREÇO
        ══════════════════════════════════════ */}
        <section id="preco" className={styles.pricingSection}>
          {/* Escassez */}
          <div className={styles.scarcityBlock}>
            <span className={styles.sectionLabel}>Escassez Real</span>
            <h3 className={styles.scarcityTitle}>Por que apenas 50 vagas para a Turma 1?</h3>
            <p className={styles.scarcityText}>
              Nós levamos tecnologia a sério. O nosso Scraper de leads exige alta capacidade 
              de processamento dos nossos servidores para rodar rápido para todos. Para garantir 
              que o sistema não fique lento, a trava de segurança bloqueará novos cadastros 
              assim que 50 pagamentos forem confirmados.
            </p>
          </div>

          {/* Pricing Card */}
          <div className={styles.pricingCard}>
            <p className={styles.priceFrom}>
              De <span className={styles.priceOld}>28.500 MT</span> por apenas:
            </p>
            <div className={styles.priceBig}>
              797 <span className={styles.priceAccent}>MT/mês</span>
            </div>
            <p className={styles.priceSub}>
              Você está a apenas 1 cliente de 3.000 MT de empatar meses da sua assinatura
            </p>
            <a href={checkoutUrl} onClick={handleCheckoutClick} className={styles.priceCta}>
              Garantir Minha Vaga (797 MT)
            </a>
          </div>
        </section>

        {/* ══════════════════════════════════════
            GARANTIA
        ══════════════════════════════════════ */}
        <section className={styles.guaranteeSection}>
          <div className={styles.guaranteeCard}>
            <div className={styles.guaranteeShield}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <span className={styles.guaranteeLabel}>Garantia Condicional</span>
            <h2 className={styles.guaranteeTitle}>Risco Zero Absoluto</h2>
            <p className={styles.guaranteeText}>
              Eu confio tanto na tecnologia que construí que vou colocar todo o risco nas minhas costas.
            </p>
            <p className={styles.guaranteeText}>
              Entre no Código Zero. Use o nosso Scraper de Leads e envie os scripts validados 
              do nosso banco por <strong>30 dias</strong>.
            </p>
            <p className={styles.guaranteeHighlight}>
              Se você fizer isso e não fechar pelo menos <strong>1 contrato de 3.000 MT</strong>, 
              eu não apenas devolvo <strong>100% do seu dinheiro em dobro</strong>, como também te dou{" "}
              <strong>1 hora de consultoria individual</strong> totalmente de graça para consertarmos o seu negócio.
            </p>
            <p className={styles.guaranteeConclusion}>
              O único risco que você corre é ficar de fora.
            </p>
            <a href={checkoutUrl} onClick={handleCheckoutClick} className={styles.guaranteeCta}>
              Aceitar o Desafio e Entrar no Código Zero
            </a>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <div>
              <div className={styles.footerLogo}>
                <Logo size={20} />
                <span className={styles.footerBrand}>Código Zero</span>
              </div>
              <p className={styles.footerDesc}>
                O ecossistema de tecnologia para criar micronegócios de IA em Moçambique.
                Sem código, sem barreiras.
              </p>
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
    </>
  );
}
