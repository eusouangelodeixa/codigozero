"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";
import { LANDING_DEFAULTS } from "../../landingDefaults";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

// ── ALL default landing page texts ──
// Single source of truth: shared with the public landing page (app/page.tsx)
// via app/landingDefaults.ts, so the editor and the page never drift. Admin
// edits these via the JSON `sections` blob on LandingConfig.
const DEFAULTS: Record<string, any> = LANDING_DEFAULTS;

const TABS = [
  { id: "vsl", label: "🎬 VSL" },
  { id: "hero", label: "🏠 Hero" },
  { id: "note", label: "🚫 O que não é" },
  { id: "clinic", label: "🏥 Clínica" },
  { id: "numbers", label: "🔢 Números" },
  { id: "founder", label: "🙋 Fundador" },
  { id: "stack", label: "🧩 Ecossistema" },
  { id: "network", label: "🤝 Network" },
  { id: "radar", label: "🛰️ Radar" },
  { id: "pricing", label: "💰 Oferta" },
  { id: "flow", label: "🪜 Como funciona" },
  { id: "guarantee", label: "🛡️ Garantia" },
  { id: "faq", label: "❓ FAQ" },
  { id: "finalcta", label: "🎯 CTA final" },
  { id: "footer", label: "📄 Footer" },
  { id: "tracking", label: "📈 Tracking" },
  { id: "affiliate", label: "🤝 Afiliados" },
];

export default function AdminLanding() {
  const [cfg, setCfg] = useState<any>({});
  const [sec, setSec] = useState<any>({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [activeTab, setActiveTab] = useState("vsl");
  // Head scripts: array of { name: string, code: string }
  const [headScriptBlocks, setHeadScriptBlocks] = useState<{ name: string; code: string }[]>([]);

  useEffect(() => {
    fetch(`${API}/api/admin/landing-config`, { headers: hdr() })
      .then(r => r.json()).then(d => {
        const config = d.config || {};
        setCfg(config);
        setSec({ ...DEFAULTS, ...(config.sections || {}) });
        // Parse stored headScriptBlocks (stored as JSON comment blocks or plain string)
        if (config.headScriptBlocks) {
          try { setHeadScriptBlocks(JSON.parse(config.headScriptBlocks)); } catch { setHeadScriptBlocks([]); }
        } else if (config.headScripts) {
          // Legacy: migrate plain headScripts to one block
          setHeadScriptBlocks([{ name: "Scripts", code: config.headScripts }]);
        }
      });
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const serializeHeadScripts = (blocks: { name: string; code: string }[]) =>
    blocks.map(b => b.code).filter(Boolean).join("\n");

  const saveAll = async () => {
    setSaving(true);
    await fetch(`${API}/api/admin/landing-config`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({
        vslEmbedHtml: cfg.vslEmbedHtml || null,
        vslEmbedUrl: cfg.vslEmbedUrl || null,
        headScripts: serializeHeadScripts(headScriptBlocks) || null,
        headScriptBlocks: JSON.stringify(headScriptBlocks),
        bodyScripts: cfg.bodyScripts || null,
        heroTitle: sec.heroTitle !== DEFAULTS.heroTitle ? sec.heroTitle : null,
        heroSubtitle: sec.heroSubtitle !== DEFAULTS.heroSubtitle ? sec.heroSubtitle : null,
        heroDesc: sec.heroDesc !== DEFAULTS.heroDesc ? sec.heroDesc : null,
        ctaText: sec.ctaText !== DEFAULTS.ctaText ? sec.ctaText : null,
        priceAmount: parseInt(sec.priceAmount) || 497,
        maxVagas: parseInt(cfg.maxVagas) || 50,
        sections: sec,
        affiliateVslEmbedHtml: cfg.affiliateVslEmbedHtml || null,
        affiliateCreativesUrl: cfg.affiliateCreativesUrl || null,
      }),
    });
    setSaving(false);
    showToast("Landing page atualizada ✓");
  };

  const saveSection = async () => {
    setSaving(true);
    // Mirror saveAll's price extraction so partial saves don't accidentally
    // restore the previous LandingConfig.priceAmount (cfg.priceAmount holds
    // the value loaded at mount, not what the user just typed).
    await fetch(`${API}/api/admin/landing-config`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({
        ...cfg,
        priceAmount: parseInt(sec.priceAmount) || cfg.priceAmount || 497,
        maxVagas: parseInt(cfg.maxVagas) || 50,
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

  // Editor for an array of plain STRINGS (e.g. notLines, clinicParas,
  // founderCreds, radarSteps). Mirrors the object-array editors' visual style;
  // copy is long so each item is a <textarea>. **bold** markers render on the page.
  const StringArray = ({ field, itemLabel, addLabel }: { field: string; itemLabel: string; addLabel: string }) => (
    <>
      {((sec[field] as string[]) || []).map((line: string, i: number) => (
        <div key={i} className={styles.formGrid} style={{ marginBottom: 12, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
          <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
            <label className={styles.formLabel}>{itemLabel} {i + 1}</label>
            <textarea className={styles.formTextarea} style={{ minHeight: 70 }} value={line} onChange={e => {
              const arr = [...(sec[field] || [])]; arr[i] = e.target.value;
              u(field, arr);
            }} />
          </div>
          <button
            type="button"
            className={styles.btnSecondary}
            style={{ fontSize: 11 }}
            onClick={() => {
              const arr = [...(sec[field] || [])]; arr.splice(i, 1);
              u(field, arr);
            }}
          >✕ Remover</button>
        </div>
      ))}
      <button
        type="button"
        className={styles.btnSecondary}
        style={{ marginTop: 8, fontSize: 12 }}
        onClick={() => u(field, [...(sec[field] || []), ""])}
      >{addLabel}</button>
    </>
  );

  const revertToDefaults = async () => {
    if (!confirm("⚠️ Reverter TODOS os textos para os valores originais?\n\nIsso vai apagar todas as customizações de texto.\nO embed da VSL e scripts de tracking serão mantidos.\n\nContinuar?")) return;
    setSaving(true);
    await fetch(`${API}/api/admin/landing-config`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({
        vslEmbedHtml: cfg.vslEmbedHtml || null,
        vslEmbedUrl: cfg.vslEmbedUrl || null,
        headScripts: serializeHeadScripts(headScriptBlocks) || null,
        headScriptBlocks: JSON.stringify(headScriptBlocks),
        bodyScripts: cfg.bodyScripts || null,
        heroTitle: null,
        heroSubtitle: null,
        heroDesc: null,
        ctaText: null,
        priceAmount: 497,
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
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito.
          </p>
          <div className={styles.formGrid}>
            <Field label="Título Principal" field="heroTitle" />
            <Field label="Subtítulo" field="heroSubtitle" />
            <Field label="Descrição" field="heroDesc" multiline />
            <Field label="Texto do CTA principal" field="heroCtaText" />
            <Field label="Sub-CTA (linha abaixo do botão)" field="heroSubCta" multiline />
            <Field label="Texto do CTA (legado, fallback)" field="ctaText" />
          </div>
        </div>
      )}

      {/* ═══ O que isso NÃO é ═══ */}
      {activeTab === "note" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🚫 O que isso não é</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito.
          </p>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="notLabel" />
            <Field label="Título" field="notTitle" />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Linhas (parágrafos)
          </h4>
          <StringArray field="notLines" itemLabel="Linha" addLabel="+ Adicionar linha" />
        </div>
      )}

      {/* ═══ Como isso vira dinheiro — clínica ═══ */}
      {activeTab === "clinic" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🏥 Como isso vira dinheiro (clínica)</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito.
          </p>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="clinicLabel" />
            <Field label="Título" field="clinicTitle" />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Parágrafos
          </h4>
          <StringArray field="clinicParas" itemLabel="Parágrafo" addLabel="+ Adicionar parágrafo" />
        </div>
      )}

      {/* ═══ Os números ═══ */}
      {activeTab === "numbers" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🔢 Os números, sem inflar</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito.
          </p>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="numbersLabel" />
            <Field label="Título" field="numbersTitle" />
            <Field label="Linha 1" field="numbersLine1" multiline />
            <Field label="Linha 2 (destaque)" field="numbersLine2" multiline />
          </div>
        </div>
      )}

      {/* ═══ Fundador ═══ */}
      {activeTab === "founder" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🙋 Quem está falando com você</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito. As imagens (retrato, Instagram e comprovante) vêm de <code>/public/founders/</code> — substitua os arquivos direto pra trocar.
          </p>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="founderLabel" />
            <Field label="Apresentação" field="founderIntro" multiline />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Credenciais
          </h4>
          <StringArray field="founderCreds" itemLabel="Credencial" addLabel="+ Adicionar credencial" />
          <div className={styles.formGrid} style={{ marginTop: 16 }}>
            <Field label="Fecho (frase final)" field="founderClosing" />
          </div>
        </div>
      )}

      {/* ═══ Ecossistema (features) ═══ */}
      {activeTab === "stack" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🧩 O ecossistema por dentro</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito nas descrições.
          </p>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="stackLabel" />
            <Field label="Título" field="stackTitle" />
            <Field label="Título — Destaque" field="stackTitleHighlight" />
            <Field label="Descrição" field="stackDesc" multiline />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Features (cards do ecossistema)
          </h4>
          {(sec.ecoFeatures || []).map((f: any, i: number) => (
            <div key={i} className={styles.formGrid} style={{ marginBottom: 12, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div className={styles.formGroup} style={{ maxWidth: 120 }}>
                <label className={styles.formLabel}>Emoji</label>
                <input className={styles.formInput} value={f.emoji} onChange={e => {
                  const arr = [...sec.ecoFeatures]; arr[i] = { ...f, emoji: e.target.value };
                  u("ecoFeatures", arr);
                }} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Título {i + 1}</label>
                <input className={styles.formInput} value={f.title} onChange={e => {
                  const arr = [...sec.ecoFeatures]; arr[i] = { ...f, title: e.target.value };
                  u("ecoFeatures", arr);
                }} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Descrição {i + 1}</label>
                <textarea className={styles.formTextarea} style={{ minHeight: 60 }} value={f.desc} onChange={e => {
                  const arr = [...sec.ecoFeatures]; arr[i] = { ...f, desc: e.target.value };
                  u("ecoFeatures", arr);
                }} />
              </div>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ fontSize: 11 }}
                onClick={() => {
                  const arr = [...sec.ecoFeatures]; arr.splice(i, 1);
                  u("ecoFeatures", arr);
                }}
              >✕ Remover</button>
            </div>
          ))}
          <button
            type="button"
            className={styles.btnSecondary}
            style={{ marginTop: 8, fontSize: 12 }}
            onClick={() => u("ecoFeatures", [...(sec.ecoFeatures || []), { emoji: "", title: "", desc: "" }])}
          >+ Adicionar feature</button>
        </div>
      )}

      {/* ═══ Network ═══ */}
      {activeTab === "network" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🤝 Network — comunidade privada</h3>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="networkLabel" />
            <Field label="Título" field="networkTitle" />
            <Field label="Título — Destaque" field="networkTitleHighlight" />
            <Field label="Descrição" field="networkDesc" multiline />
            <Field label='Contagem (ex: "143")' field="networkMembersCount" />
            <Field label='Label da contagem (ex: "membros ativos")' field="networkMembersLabel" />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 12 }}>
            A imagem mostrada vem de <code>/public/comunidade.jpg</code> — substitua o arquivo direto pra trocar.
          </p>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Pilares da network (4 ideais)
          </h4>
          {(sec.networkPillars || []).map((p: any, i: number) => (
            <div key={i} className={styles.formGrid} style={{ marginBottom: 12, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Pilar {i + 1} — Título</label>
                <input className={styles.formInput} value={p.title} onChange={e => {
                  const arr = [...sec.networkPillars]; arr[i] = { ...p, title: e.target.value };
                  u("networkPillars", arr);
                }} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Pilar {i + 1} — Descrição</label>
                <textarea className={styles.formTextarea} style={{ minHeight: 60 }} value={p.desc} onChange={e => {
                  const arr = [...sec.networkPillars]; arr[i] = { ...p, desc: e.target.value };
                  u("networkPillars", arr);
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ Radar (como funciona) ═══ */}
      {activeTab === "radar" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🛰️ Como o Radar funciona (na prática)</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito.
          </p>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="radarLabel" />
            <Field label="Título" field="radarTitle" />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Passos (numerados automaticamente)
          </h4>
          <StringArray field="radarSteps" itemLabel="Passo" addLabel="+ Adicionar passo" />
          <div className={styles.formGrid} style={{ marginTop: 16 }}>
            <Field label="Fecho (frase final)" field="radarClosing" multiline />
          </div>
        </div>
      )}

      {/* ═══ Flow — Como funciona ═══ */}
      {activeTab === "flow" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🪜 Como funciona</h3>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="flowLabel" />
            <Field label="Título" field="flowTitle" />
            <Field label="Título — Destaque" field="flowTitleHighlight" />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Passos (4 ideais)
          </h4>
          {(sec.flowSteps || []).map((s: any, i: number) => (
            <div key={i} className={styles.formGrid} style={{ marginBottom: 12, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div className={styles.formGroup} style={{ maxWidth: 120 }}>
                <label className={styles.formLabel}>Nº</label>
                <input className={styles.formInput} value={s.num} onChange={e => {
                  const arr = [...sec.flowSteps]; arr[i] = { ...s, num: e.target.value };
                  u("flowSteps", arr);
                }} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Título</label>
                <input className={styles.formInput} value={s.title} onChange={e => {
                  const arr = [...sec.flowSteps]; arr[i] = { ...s, title: e.target.value };
                  u("flowSteps", arr);
                }} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Descrição</label>
                <textarea className={styles.formTextarea} style={{ minHeight: 50 }} value={s.desc} onChange={e => {
                  const arr = [...sec.flowSteps]; arr[i] = { ...s, desc: e.target.value };
                  u("flowSteps", arr);
                }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ FAQ ═══ */}
      {activeTab === "faq" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>❓ FAQ</h3>
          <div className={styles.formGrid}>
            <Field label="Label (tag)" field="faqLabel" />
            <Field label="Título da seção" field="faqTitle" />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "20px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Perguntas e respostas
          </h4>
          {(sec.faqItems || []).map((item: any, i: number) => (
            <div key={i} className={styles.formGrid} style={{ marginBottom: 12, padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Pergunta {i + 1}</label>
                <input className={styles.formInput} value={item.q} onChange={e => {
                  const arr = [...sec.faqItems]; arr[i] = { ...item, q: e.target.value };
                  u("faqItems", arr);
                }} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Resposta {i + 1}</label>
                <textarea className={styles.formTextarea} style={{ minHeight: 80 }} value={item.a} onChange={e => {
                  const arr = [...sec.faqItems]; arr[i] = { ...item, a: e.target.value };
                  u("faqItems", arr);
                }} />
              </div>
              <button
                type="button"
                className={styles.btnSecondary}
                style={{ fontSize: 11 }}
                onClick={() => {
                  const arr = [...sec.faqItems]; arr.splice(i, 1);
                  u("faqItems", arr);
                }}
              >Remover</button>
            </div>
          ))}
          <button
            type="button"
            className={styles.btnSecondary}
            style={{ marginTop: 8, fontSize: 12 }}
            onClick={() => u("faqItems", [...(sec.faqItems || []), { q: "", a: "" }])}
          >+ Adicionar pergunta</button>
        </div>
      )}

      {/* ═══ Oferta — Pricing + Close Friends ═══ */}
      {activeTab === "pricing" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>💰 A oferta (preço & Close Friends)</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
            Use <code>**texto**</code> para deixar trechos em negrito.
          </p>
          <div className={styles.formGrid}>
            <Field label="Label de contexto (ex: A oferta)" field="scarcityLabel" />
            <Field label="Título de contexto" field="scarcityTitle" />
            <Field label="Descrição de contexto" field="scarcityDesc" multiline />
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>"De" (preço riscado — opcional)</label>
              <input className={styles.formInput} value={sec.priceFrom || ""} onChange={e => u("priceFrom", e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Preço Atual</label>
              <input className={styles.formInput} value={sec.priceAmount || "497"} onChange={e => u("priceAmount", e.target.value)} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Período</label>
              <input className={styles.formInput} value={sec.pricePeriod || "MT/mês"} onChange={e => u("pricePeriod", e.target.value)} />
            </div>
            <Field label="Texto abaixo do preço" field="priceSub" multiline />
            <Field label="Texto do CTA do Preço" field="priceCtaText" />
          </div>
          <h4 style={{ color: "#888", fontSize: 12, margin: "24px 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Close Friends (order bump exibido no card de preço)
          </h4>
          <div className={styles.formGrid}>
            <Field label="Badge label (ex: Close Friends)" field="closeFriendsLabel" />
            <Field label="Título" field="closeFriendsTitle" />
            <Field label="Descrição (suporta <strong>)" field="closeFriendsDesc" multiline />
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

      {/* ═══ CTA final ═══ */}
      {activeTab === "finalcta" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🎯 CTA final</h3>
          <div className={styles.formGrid}>
            <Field label="Título" field="finalCtaTitle" />
            <Field label="Descrição" field="finalCtaDesc" multiline />
            <Field label="Texto do botão" field="finalCtaText" />
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
          <h3 className={styles.cardTitle}>📈 Tracking — Head Scripts</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 20 }}>
            Adicione múltiplos scripts para o <code style={{ background: "rgba(99,102,241,0.15)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>&lt;head&gt;</code> da landing page.
            Cada bloco tem um nome identificativo (ex: "Meta Pixel", "VSL Pixel"). Só ficam no código — não aparecem visualmente.
          </p>

          {headScriptBlocks.length === 0 && (
            <p style={{ color: "#666", fontSize: 13, marginBottom: 16, fontStyle: "italic" }}>Nenhum script adicionado. Clique em "+ Adicionar Script" para começar.</p>
          )}

          {headScriptBlocks.map((block, i) => (
            <div key={i} style={{
              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(99,102,241,0.2)",
              borderRadius: 10, padding: 16, marginBottom: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{
                  background: "rgba(99,102,241,0.2)", color: "#a5b4fc",
                  borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.06em", textTransform: "uppercase",
                }}>#{i + 1}</span>
                <input
                  className={styles.formInput}
                  style={{ flex: 1, fontWeight: 600 }}
                  placeholder="Nome do script (ex: Meta Pixel, VSL Pixel, GTM)"
                  value={block.name}
                  onChange={e => {
                    const updated = [...headScriptBlocks];
                    updated[i] = { ...block, name: e.target.value };
                    setHeadScriptBlocks(updated);
                  }}
                />
                <button
                  onClick={() => setHeadScriptBlocks(headScriptBlocks.filter((_, idx) => idx !== i))}
                  style={{
                    background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                    color: "#ef4444", borderRadius: 6, padding: "6px 12px", cursor: "pointer",
                    fontSize: 12, fontWeight: 600,
                  }}
                >✕ Remover</button>
              </div>
              <textarea
                className={styles.formTextarea}
                style={{ minHeight: 120, fontFamily: "monospace", fontSize: 12 }}
                placeholder={`<!-- Código do ${block.name || "script"} -->`}
                value={block.code}
                onChange={e => {
                  const updated = [...headScriptBlocks];
                  updated[i] = { ...block, code: e.target.value };
                  setHeadScriptBlocks(updated);
                }}
              />
            </div>
          ))}

          <button
            className={styles.btnSecondary}
            style={{ marginTop: 4 }}
            onClick={() => setHeadScriptBlocks([...headScriptBlocks, { name: "", code: "" }])}
          >
            + Adicionar Script no &lt;head&gt;
          </button>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <label className={styles.formLabel} style={{ marginBottom: 8, display: "block" }}>Body Scripts (&lt;/body&gt;)</label>
            <p style={{ color: "#666", fontSize: 12, marginBottom: 10 }}>Para scripts que devem ser injetados antes do fechamento do body (ex: noscript do GTM).</p>
            <textarea
              className={styles.formTextarea}
              style={{ minHeight: 100, fontFamily: "monospace", fontSize: 12 }}
              placeholder="<!-- Google Tag Manager (noscript) -->..."
              value={cfg.bodyScripts || ""}
              onChange={e => setCfg({ ...cfg, bodyScripts: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* ═══ Affiliate ═══ */}
      {activeTab === "affiliate" && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>🤝 Landing dos Afiliados</h3>
          <p className={styles.cardDesc} style={{ marginBottom: 20 }}>
            Esses campos só se aplicam à página acessada via{" "}
            <code style={{ background: "rgba(99,102,241,0.15)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
              /r/&#123;código&#125;
            </code>
            . Se vazios, a landing de afiliados usa a VSL padrão.
          </p>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>VSL exclusiva da landing de afiliados</label>
            <p style={{ color: "#666", fontSize: 12, marginBottom: 10 }}>
              Cole o &lt;iframe&gt; da VSL específica do afiliado. Quando preenchido, sobrepõe a VSL padrão na rota{" "}
              <code style={{ fontFamily: "monospace" }}>/r/&#123;código&#125;</code>.
            </p>
            <textarea
              className={styles.formTextarea}
              style={{ minHeight: 100, fontFamily: "monospace", fontSize: 12 }}
              placeholder='<iframe width="100%" style="aspect-ratio: 16/9;" src="https://..." frameborder="0" allowfullscreen></iframe>'
              value={cfg.affiliateVslEmbedHtml || ""}
              onChange={e => setCfg({ ...cfg, affiliateVslEmbedHtml: e.target.value })}
            />
            {cfg.affiliateVslEmbedHtml && (
              <div style={{ marginTop: 16 }}>
                <label className={styles.formLabel} style={{ marginBottom: 8, display: "block" }}>Preview:</label>
                <div
                  style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(45,212,191,0.15)" }}
                  dangerouslySetInnerHTML={{ __html: cfg.affiliateVslEmbedHtml }}
                />
              </div>
            )}
          </div>

          <div className={styles.formGroup} style={{ marginTop: 24 }}>
            <label className={styles.formLabel}>Pasta de criativos (URL pública)</label>
            <p style={{ color: "#666", fontSize: 12, marginBottom: 10 }}>
              Link para Google Drive, Notion ou Dropbox com banners, vídeos e prints que os afiliados podem usar.
              O botão "Acessar pasta de criativos" no painel do afiliado leva para esta URL.
            </p>
            <input
              className={styles.formInput}
              placeholder="https://drive.google.com/..."
              value={cfg.affiliateCreativesUrl || ""}
              onChange={e => setCfg({ ...cfg, affiliateCreativesUrl: e.target.value })}
            />
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
