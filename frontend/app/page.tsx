"use client";
import { useState, useEffect } from "react";
import { Logo } from "@/components/Logo";
import styles from "./landing.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function LandingPage() {
  const [gateOpen, setGateOpen] = useState(true);
  const [formData, setFormData] = useState({ name: "", phone: "", whatsapp: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState("#");

  useEffect(() => {
    const saved = localStorage.getItem("cz_lead");
    if (saved) {
      try {
        const lead = JSON.parse(saved);
        setCheckoutUrl(lead.checkoutUrl || "#");
        setGateOpen(false);
      } catch {}
    }
  }, []);

  const handleGateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/api/landing/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("cz_lead", JSON.stringify({
          leadId: data.leadId,
          checkoutUrl: data.checkoutUrl,
          ...formData,
        }));
        setCheckoutUrl(data.checkoutUrl || "#");
      }
      setGateOpen(false);
    } catch {
      setGateOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {/* ═══ GATE FORM ═══ */}
      {gateOpen && (
        <div className={styles.gate}>
          <div className={styles.gateInner}>
            <div className={styles.gateLogo}><Logo size={48} /></div>
            <h1 className={styles.gateTitle}>Código Zero</h1>
            <p className={styles.gateDesc}>
              Preencha seus dados para acessar a apresentação e garantir sua vaga.
            </p>
            <form onSubmit={handleGateSubmit} className={styles.gateForm}>
              <div>
                <label className={styles.gateLabel}>Nome completo</label>
                <input type="text" required placeholder="Seu nome"
                  className={styles.gateInput} value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
              </div>
              <div>
                <label className={styles.gateLabel}>E-mail</label>
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
                Seus dados estão seguros. Não enviamos spam.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* ═══ LANDING PAGE ═══ */}
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
              <span className={styles.navVagas}>
                <span className={styles.navVagasDot} />
                Vagas Abertas
              </span>
              <a href={checkoutUrl} className={styles.navCta}>Garantir Vaga</a>
            </div>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <span className={styles.heroBadge}>
              <span className={styles.heroBadgeDot} />
              Código Zero · Turma 1
            </span>
            <h1 className={styles.heroTitle}>
              Ganhe 50 mil MT/mês com{" "}
              <span className={styles.heroHighlight}>Inteligência Artificial</span>
            </h1>
            <p className={styles.heroDesc}>
              Crie e venda automações e plataformas de IA sem escrever uma única linha de código.
              O ecossistema completo para montar seu micronegócio digital em Moçambique.
            </p>
            <div className={styles.heroCtas}>
              <a href={checkoutUrl} className={styles.ctaPrimary}>Garantir Minha Vaga · 797 MT/mês</a>
              <button onClick={() => scrollTo("conteudo")} className={styles.ctaSecondary}>Ver Conteúdo</button>
            </div>
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

          <div className={styles.heroMedia}>
            <div className={styles.vslWrapper}>
              <div className={styles.vslBar}>
                <span className={`${styles.vslDot} ${styles.vslDotR}`} />
                <span className={`${styles.vslDot} ${styles.vslDotY}`} />
                <span className={`${styles.vslDot} ${styles.vslDotG}`} />
                <span className={styles.vslBarTitle}>Apresentação</span>
              </div>
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

        {/* ── O PROBLEMA ── */}
        <section id="problema" className={styles.section}>
          <span className={styles.sectionLabel}>O Problema</span>
          <h2 className={styles.sectionTitle}>
            Você quer fazer renda extra, <span className={styles.sectionTitleHighlight}>mas trava na execução</span>
          </h2>
          <p className={styles.sectionDesc}>
            Já tentou vender e-book e não funcionou. Acha que precisa de um computador de última geração, 
            ou que programar leva anos de estudo. O mercado antigo exigia tudo isso. Mas o jogo mudou.
          </p>

          <div className={styles.problemGrid}>
            {/* Card 1: Cenário Atual */}
            <div className={styles.problemCard}>
              <span className={styles.problemCardLabel}>Cenário Atual</span>
              <h3 className={styles.problemCardTitle}>Você tem a ideia, mas não sabe executar</h3>
              <ul className={styles.problemList}>
                {[
                  "Não sabe prospectar clientes de forma escalável",
                  "Não sabe criar automações que vendem",
                  "Ficou preso em cursinhos que não levam a nada",
                  "Não tem capital para investir em ferramentas caras",
                  "Não sabe por onde começar no digital",
                  "Vergonha de abordar empresas pelo WhatsApp",
                ].map((item, i) => (
                  <li key={i} className={styles.problemListItem}>
                    <span className={styles.problemX}>✕</span> {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 2: O que você aprende */}
            <div className={styles.problemCard}>
              <span className={styles.problemCardLabel}>O Ecossistema</span>
              <h3 className={styles.problemCardTitle}>O que o Código Zero te entrega</h3>
              <ul className={styles.problemList}>
                {[
                  "Scraper que encontra leads automaticamente",
                  "Scripts de vendas validados para WhatsApp",
                  "Aulas passo a passo para criar SaaS e LPs",
                  "Comunidade ativa no Discord",
                  "Mentorias ao vivo semanais",
                  "Zero código: tudo com ferramentas visuais",
                  "Prompts profissionais prontos para usar",
                ].map((item, i) => (
                  <li key={i} className={styles.problemListItem}>
                    <span className={styles.problemCheck}>✓</span> {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Card 3: Accent (CTA) */}
            <div className={`${styles.problemCard} ${styles.problemCardAccent}`}>
              <span className={styles.problemCardLabel}>A Proposta</span>
              <h3 className={styles.problemCardTitle}>Código Zero</h3>
              <p className={styles.problemCardText}>
                O ecossistema completo para você criar micronegócios de IA sem escrever código.
                Das ferramentas ao conhecimento, do primeiro lead ao primeiro contrato.
              </p>
              <a href={checkoutUrl} className={styles.problemCardBtn}>
                ⚡ Do zero ao deploy
              </a>
            </div>
          </div>
        </section>

        {/* ── EMPILHAMENTO DE VALOR ── */}
        <section id="conteudo" className={styles.section}>
          <span className={styles.sectionLabel}>O que está incluído</span>
          <h2 className={styles.sectionTitle}>
            Tudo que você precisa, <span className={styles.sectionTitleHighlight}>num único lugar</span>
          </h2>
          <p className={styles.sectionDesc}>
            Se eu cobrasse cada componente separadamente, o valor total passaria de 20.000 MT.
            Mas você não vai pagar isso.
          </p>

          <div className={styles.stackGrid}>
            {[
              { name: "Scraper de Leads Ilimitado", value: "5.000 MT/mês" },
              { name: "Banco de Scripts de Vendas", value: "3.000 MT" },
              { name: "Aulas Passo a Passo (4 Módulos)", value: "7.000 MT" },
              { name: "Mentorias ao Vivo Semanais", value: "10.000 MT/mês" },
              { name: "Comunidade Exclusiva no Discord", value: "2.000 MT" },
              { name: "Prompts Profissionais de Copy", value: "1.500 MT" },
            ].map((item, i) => (
              <div key={i} className={styles.stackItem}>
                <span className={styles.stackName}>{item.name}</span>
                <span className={styles.stackValue}>{item.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── PREÇO ── */}
        <section id="preco" className={styles.pricingSection}>
          <span className={styles.sectionLabel}>Preço</span>
          <h2 className={styles.sectionTitle} style={{ margin: "0 auto", textAlign: "center", marginBottom: 12 }}>
            Investimento acessível, <span className={styles.sectionTitleHighlight}>retorno real</span>
          </h2>
          <p className={styles.sectionDesc} style={{ margin: "0 auto", textAlign: "center", marginBottom: 48 }}>
            Um valor simbólico para separar os curiosos de quem realmente vai executar.
          </p>

          <div className={styles.pricingCard}>
            <div className={styles.priceBig}>
              797 <span className={styles.priceAccent}>MT/mês</span>
            </div>
            <p className={styles.priceSub}>Acesso completo a todo o ecossistema Código Zero</p>
            <a href={checkoutUrl} className={styles.priceCta}>Garantir Minha Vaga Agora</a>
            <div className={styles.guarantee}>
              <svg className={styles.guaranteeIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>
                <span className={styles.guaranteeBold}>30 dias de garantia</span> — se não fechar 
                pelo menos 1 contrato de 3.000 MT, devolvemos o dobro + 1h de consultoria grátis.
              </span>
            </div>
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
                <a href="#problema" className={styles.footerLink}>O Problema</a>
                <a href="#conteudo" className={styles.footerLink}>Conteúdo</a>
                <a href="#preco" className={styles.footerLink}>Preço</a>
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
