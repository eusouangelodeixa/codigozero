"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

// ── ALL default landing page texts ──
const DEFAULTS: Record<string, any> = {
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

const TABS = [
  { id: "vsl", label: "🎬 VSL" },
  { id: "hero", label: "🏠 Hero" },
  { id: "pain", label: "😰 Dor" },
  { id: "solution", label: "💡 Solução" },
  { id: "value", label: "📦 Value Stack" },
  { id: "pricing", label: "💰 Preço" },
  { id: "guarantee", label: "🛡️ Garantia" },
  { id: "footer", label: "📄 Footer" },
  { id: "tracking", label: "📈 Tracking" },
];

export default function AdminLanding() {
  const [cfg, setCfg] = useState<any>({});
  const [sec, setSec] = useState<any>({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [activeTab, setActiveTab] = useState("vsl");

  useEffect(() => {
    fetch(`${API}/api/admin/landing-config`, { headers: hdr() })
      .then(r => r.json()).then(d => {
        const config = d.config || {};
        setCfg(config);
        setSec({ ...DEFAULTS, ...(config.sections || {}) });
      });
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const saveAll = async () => {
    setSaving(true);
    await fetch(`${API}/api/admin/landing-config`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({
        vslEmbedHtml: cfg.vslEmbedHtml || null,
        vslEmbedUrl: cfg.vslEmbedUrl || null,
        headScripts: cfg.headScripts || null,
        bodyScripts: cfg.bodyScripts || null,
        heroTitle: sec.heroTitle !== DEFAULTS.heroTitle ? sec.heroTitle : null,
        heroSubtitle: sec.heroSubtitle !== DEFAULTS.heroSubtitle ? sec.heroSubtitle : null,
        heroDesc: sec.heroDesc !== DEFAULTS.heroDesc ? sec.heroDesc : null,
        ctaText: sec.ctaText !== DEFAULTS.ctaText ? sec.ctaText : null,
        priceAmount: parseInt(sec.priceAmount) || 797,
        maxVagas: parseInt(sec.stat2Value) || 50,
        sections: sec,
      }),
    });
    setSaving(false);
    showToast("Landing page atualizada ✓");
  };

  const saveSection = async () => {
    setSaving(true);
    await fetch(`${API}/api/admin/landing-config`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({
        ...cfg,
        sections: sec,
      }),
    });
    setSaving(false);
    showToast(`Seção "${TABS.find(t => t.id === activeTab)?.label}" salva ✓`);
  };

  const u = (key: string, val: any) => setSec((prev: any) => ({ ...prev, [key]: val }));

  // Text input helper
  const Field = ({ label, field, multiline, mono }: { label: string; field: string; multiline?: boolean; mono?: boolean }) => (
    <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
      <label className={styles.formLabel}>{label}</label>
      {multiline ? (
        <textarea className={styles.formTextarea} style={mono ? { fontFamily: "monospace", fontSize: 12 } : {}}
          value={sec[field] || ""} onChange={e => u(field, e.target.value)} />
      ) : (
        <input className={styles.formInput} value={sec[field] || ""} onChange={e => u(field, e.target.value)} />
      )}
    </div>
  );

  const revertToDefaults = async () => {
    if (!confirm("⚠️ Reverter TODOS os textos para os valores originais?\n\nIsso vai apagar todas as customizações de texto.\nO embed da VSL será mantido.\n\nContinuar?")) return;
    setSaving(true);
    await fetch(`${API}/api/admin/landing-config`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({
        vslEmbedHtml: cfg.vslEmbedHtml || null,
        vslEmbedUrl: cfg.vslEmbedUrl || null,
        headScripts: cfg.headScripts || null,
        bodyScripts: cfg.bodyScripts || null,
        heroTitle: null,
        heroSubtitle: null,
        heroDesc: null,
        ctaText: null,
        priceAmount: 797,
        maxVagas: 50,
        sections: null,
      }),
    });
    setSec({ ...DEFAULTS });
    setSaving(false);
    showToast("Textos revertidos para os valores originais ✓");
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Editor da Landing Page</h1>
        <p className={styles.pageDesc}>Edite todo o conteúdo da página de vendas. Os textos já carregam os valores atuais.</p>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, flexWrap: "wrap" }}>
        {TABS.map(tab => (
          <button key={tab.id}
            className={`${styles.filterBtn} ${activeTab === tab.id ? styles.filterBtnActive : ""}`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ VSL / Embed ═══ */}
      {activeTab === "vsl" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🎬 VSL (Video Sales Letter)</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Cole o código iframe completo do Kilax, YouTube ou Vimeo. Ex: &lt;iframe ...&gt;&lt;/iframe&gt;
          </p>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Código Embed (iframe HTML)</label>
            <textarea className={styles.formTextarea}
              style={{ minHeight: 100, fontFamily: "monospace", fontSize: 12 }}
              placeholder='<iframe width="100%" style="aspect-ratio: 16/9;" src="https://web.kilax.app/embed/..." title="Kilax Player" frameborder="0" allowfullscreen></iframe>'
              value={cfg.vslEmbedHtml || ""}
              onChange={e => setCfg({ ...cfg, vslEmbedHtml: e.target.value })} />
          </div>
          {cfg.vslEmbedHtml && (
            <div style={{ marginTop: 16 }}>
              <label className={styles.formLabel} style={{ marginBottom: 8, display: "block" }}>Preview:</label>
              <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(45,212,191,0.15)" }}
                dangerouslySetInnerHTML={{ __html: cfg.vslEmbedHtml }} />
            </div>
          )}
          <div style={{ marginTop: 16 }} className={styles.formGrid}>
            <Field label="Título da VSL Bar" field="vslTitle" />
            <Field label="Subtítulo (texto abaixo do play)" field="vslSubtitle" />
            <Field label="Hint (texto pequeno)" field="vslHint" />
          </div>
        </div>
      )}

      {/* ═══ Hero ═══ */}
      {activeTab === "hero" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🏠 Hero Section</h3>
          <div className={styles.formGrid}>
            <Field label="Título Principal" field="heroTitle" />
            <Field label="Subtítulo" field="heroSubtitle" />
            <Field label="Descrição" field="heroDesc" multiline />
            <Field label="Texto do CTA" field="ctaText" />
            <Field label="Texto de Confiança (abaixo do CTA)" field="trustText" />
            <div className={`${styles.formGroup}`}>
              <label className={styles.formLabel}>Stat 1 — Valor</label>
              <input className={styles.formInput} value={sec.stat1Value || ""} onChange={e => u("stat1Value", e.target.value)} />
            </div>
            <div className={`${styles.formGroup}`}>
              <label className={styles.formLabel}>Stat 1 — Label</label>
              <input className={styles.formInput} value={sec.stat1Label || ""} onChange={e => u("stat1Label", e.target.value)} />
            </div>
            <div className={`${styles.formGroup}`}>
              <label className={styles.formLabel}>Stat 2 — Valor</label>
              <input className={styles.formInput} value={sec.stat2Value || ""} onChange={e => u("stat2Value", e.target.value)} />
            </div>
            <div className={`${styles.formGroup}`}>
              <label className={styles.formLabel}>Stat 2 — Label</label>
              <input className={styles.formInput} value={sec.stat2Label || ""} onChange={e => u("stat2Label", e.target.value)} />
            </div>
            <div className={`${styles.formGroup}`}>
              <label className={styles.formLabel}>Stat 3 — Valor</label>
              <input className={styles.formInput} value={sec.stat3Value || ""} onChange={e => u("stat3Value", e.target.value)} />
            </div>
            <div className={`${styles.formGroup}`}>
              <label className={styles.formLabel}>Stat 3 — Label</label>
              <input className={styles.formInput} value={sec.stat3Label || ""} onChange={e => u("stat3Label", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {/* ═══ Pain ═══ */}
      {activeTab === "pain" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>😰 Seção de Dor</h3>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="painLabel" />
            <Field label="Título" field="painTitle" />
            <Field label="Título — Destaque" field="painTitleHighlight" />
            <Field label="Descrição" field="painDesc" />
          </div>
          <div className={`${styles.formGroup} ${styles.formGroupFull}`} style={{ marginTop: 16 }}>
            <label className={styles.formLabel}>Itens de Dor (um por linha)</label>
            <textarea className={styles.formTextarea} style={{ minHeight: 160 }}
              value={(sec.painItems || []).join("\n")}
              onChange={e => u("painItems", e.target.value.split("\n").filter((s: string) => s.trim()))} />
          </div>
          <div className={styles.formGrid} style={{ marginTop: 16 }}>
            <Field label="Conclusão" field="painConclusion" />
            <Field label="Sub-Conclusão" field="painConclusionSub" multiline />
          </div>
        </div>
      )}

      {/* ═══ Solution ═══ */}
      {activeTab === "solution" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>💡 Seção de Solução</h3>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="solutionLabel" />
            <Field label="Título" field="solutionTitle" />
            <Field label="Título — Destaque" field="solutionTitleHighlight" />
            <Field label="Descrição" field="solutionDesc" multiline />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>Cards de Solução</h4>
          {(sec.solutionCards || []).map((card: any, i: number) => (
            <div key={i} className={styles.formGrid} style={{ marginBottom: 12, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Título Card {i + 1}</label>
                <input className={styles.formInput} value={card.title} onChange={e => {
                  const c = [...sec.solutionCards]; c[i] = { ...card, title: e.target.value };
                  u("solutionCards", c);
                }} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Descrição Card {i + 1}</label>
                <textarea className={styles.formTextarea} style={{ minHeight: 60 }} value={card.desc} onChange={e => {
                  const c = [...sec.solutionCards]; c[i] = { ...card, desc: e.target.value };
                  u("solutionCards", c);
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Value Stack ═══ */}
      {activeTab === "value" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>📦 Value Stack</h3>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="valueLabel" />
            <Field label="Título" field="valueTitle" />
            <Field label="Título — Destaque" field="valueTitleHighlight" />
            <Field label="Descrição" field="valueDesc" multiline />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>Itens de Valor</h4>
          {(sec.valueItems || []).map((item: any, i: number) => (
            <div key={i} className={styles.formGrid} style={{ marginBottom: 8 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Item {i + 1}</label>
                <input className={styles.formInput} value={item.name} onChange={e => {
                  const items = [...sec.valueItems]; items[i] = { ...item, name: e.target.value };
                  u("valueItems", items);
                }} />
              </div>
              <div className={styles.formGroup} style={{ maxWidth: 200 }}>
                <label className={styles.formLabel}>Preço</label>
                <input className={styles.formInput} value={item.value} onChange={e => {
                  const items = [...sec.valueItems]; items[i] = { ...item, value: e.target.value };
                  u("valueItems", items);
                }} />
              </div>
            </div>
          ))}
          <button className={styles.btnSecondary} style={{ marginTop: 8, fontSize: 12 }} onClick={() => {
            u("valueItems", [...(sec.valueItems || []), { name: "", value: "" }]);
          }}>+ Adicionar Item</button>
          <div className={styles.formGrid} style={{ marginTop: 16 }}>
            <Field label="Label Total" field="valueTotalLabel" />
            <Field label="Valor Total" field="valueTotalAmount" />
            <Field label="Frase de Impacto" field="valuePunchline" />
          </div>
        </div>
      )}

      {/* ═══ Pricing ═══ */}
      {activeTab === "pricing" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>💰 Preço & Escassez</h3>
          <div className={styles.formGrid}>
            <Field label="Label de Escassez" field="scarcityLabel" />
            <Field label="Título de Escassez" field="scarcityTitle" />
            <Field label="Descrição de Escassez" field="scarcityDesc" multiline />
            <Field label='Preço "De" (riscado)' field="priceFrom" />
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Preço Atual</label>
              <input className={styles.formInput} value={sec.priceAmount || "797"} onChange={e => u("priceAmount", e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Período</label>
              <input className={styles.formInput} value={sec.pricePeriod || "MT/mês"} onChange={e => u("pricePeriod", e.target.value)} />
            </div>
            <Field label="Texto abaixo do preço" field="priceSub" />
            <Field label="Texto do CTA do Preço" field="priceCtaText" />
          </div>
        </div>
      )}

      {/* ═══ Guarantee ═══ */}
      {activeTab === "guarantee" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🛡️ Seção de Garantia</h3>
          <div className={styles.formGrid}>
            <Field label="Label" field="guaranteeLabel" />
            <Field label="Título" field="guaranteeTitle" />
            <Field label="Texto 1" field="guaranteeText1" multiline />
            <Field label="Texto 2" field="guaranteeText2" multiline />
            <Field label="Destaque (texto em destaque)" field="guaranteeHighlight" multiline />
            <Field label="Conclusão" field="guaranteeConclusion" />
            <Field label="Texto do CTA" field="guaranteeCtaText" />
          </div>
        </div>
      )}

      {/* ═══ Footer ═══ */}
      {activeTab === "footer" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>📄 Footer</h3>
          <Field label="Descrição do Footer" field="footerDesc" multiline />
        </div>
      )}

      {/* ═══ Tracking ═══ */}
      {activeTab === "tracking" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>📈 Tracking (Pixels & Scripts)</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Insira os códigos do Meta Pixel, Google Analytics (GA4) ou GTM. Esses scripts serão carregados em todas as páginas da aplicação.
          </p>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Head Scripts (&lt;head&gt;)</label>
            <textarea className={styles.formTextarea}
              style={{ minHeight: 150, fontFamily: "monospace", fontSize: 12 }}
              placeholder="<!-- Meta Pixel Code -->..."
              value={cfg.headScripts || ""}
              onChange={e => setCfg({ ...cfg, headScripts: e.target.value })} />
          </div>
          <div className={styles.formGroup} style={{ marginTop: 16 }}>
            <label className={styles.formLabel}>Body Scripts (&lt;body&gt;)</label>
            <textarea className={styles.formTextarea}
              style={{ minHeight: 150, fontFamily: "monospace", fontSize: 12 }}
              placeholder="<!-- Google Tag Manager (noscript) -->..."
              value={cfg.bodyScripts || ""}
              onChange={e => setCfg({ ...cfg, bodyScripts: e.target.value })} />
          </div>
        </div>
      )}

      {/* Save Buttons */}
      <div className={styles.btnRow}>
        <button className={styles.btnPrimary} onClick={saveAll} disabled={saving}>
          {saving ? "Salvando..." : "💾 Salvar Tudo"}
        </button>
        <button className={styles.btnSecondary} onClick={saveSection} disabled={saving}>
          Salvar Apenas "{TABS.find(t => t.id === activeTab)?.label}"
        </button>
        <a href="/" target="_blank" className={styles.btnSecondary} style={{ textDecoration: "none", textAlign: "center" }}>
          Ver Landing Page →
        </a>
        <button
          onClick={revertToDefaults}
          disabled={saving}
          style={{
            padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            color: "#ef4444", cursor: "pointer",
          }}
        >
          🔄 Reverter para Padrão
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
