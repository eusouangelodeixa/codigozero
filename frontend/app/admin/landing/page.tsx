"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminLanding() {
  const [config, setConfig] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    fetch(`${API}/api/admin/landing-config`, { headers: hdr() })
      .then(r => r.json()).then(d => setConfig(d.config || {}));
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const save = async () => {
    setSaving(true);
    await fetch(`${API}/api/admin/landing-config`, {
      method: "PATCH", headers: hdr(), body: JSON.stringify(config),
    });
    setSaving(false);
    showToast("Landing page atualizada ✓");
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Editor da Landing Page</h1>
        <p className={styles.pageDesc}>Configure textos, VSL e configurações da página de vendas</p>
      </div>

      {/* VSL Section */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>🎬 VSL (Video Sales Letter)</h3>
        <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
          Cole a URL de embed do vídeo (YouTube, Vimeo, Kilax). Deixe vazio para mostrar o placeholder.
        </p>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>URL do Embed</label>
          <input
            className={styles.formInput}
            placeholder="https://www.youtube.com/embed/... ou iframe URL"
            value={config.vslEmbedUrl || ""}
            onChange={e => setConfig({ ...config, vslEmbedUrl: e.target.value })}
          />
        </div>
        {config.vslEmbedUrl && (
          <div style={{ marginTop: 16, borderRadius: 8, overflow: "hidden", border: "1px solid rgba(45,212,191,0.15)" }}>
            <iframe
              src={config.vslEmbedUrl}
              style={{ width: "100%", aspectRatio: "16/9", border: "none" }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
      </div>

      {/* Hero Texts */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>📝 Textos do Hero</h3>
        <p className={styles.cardDesc} style={{ marginBottom: 16 }}>
          Personalize os textos principais. Deixe vazio para usar os padrões.
        </p>
        <div className={styles.formGrid}>
          <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
            <label className={styles.formLabel}>Título Principal</label>
            <input
              className={styles.formInput}
              placeholder="Como gerar os seus primeiros 50.000 MT/mês com Inteligência Artificial"
              value={config.heroTitle || ""}
              onChange={e => setConfig({ ...config, heroTitle: e.target.value })}
            />
          </div>
          <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
            <label className={styles.formLabel}>Subtítulo</label>
            <input
              className={styles.formInput}
              placeholder="Sem digitar uma única linha de código"
              value={config.heroSubtitle || ""}
              onChange={e => setConfig({ ...config, heroSubtitle: e.target.value })}
            />
          </div>
          <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
            <label className={styles.formLabel}>Descrição</label>
            <textarea
              className={styles.formTextarea}
              placeholder="O ecossistema completo que te entrega a ferramenta..."
              value={config.heroDesc || ""}
              onChange={e => setConfig({ ...config, heroDesc: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Texto do CTA</label>
            <input
              className={styles.formInput}
              placeholder="Quero Garantir 1 das 50 Vagas Agora"
              value={config.ctaText || ""}
              onChange={e => setConfig({ ...config, ctaText: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>💰 Preço & Vagas</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Preço (MT/mês)</label>
            <input
              className={styles.formInput}
              type="number"
              value={config.priceAmount || 797}
              onChange={e => setConfig({ ...config, priceAmount: parseInt(e.target.value) || 797 })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Máximo de Vagas</label>
            <input
              className={styles.formInput}
              type="number"
              value={config.maxVagas || 50}
              onChange={e => setConfig({ ...config, maxVagas: parseInt(e.target.value) || 50 })}
            />
          </div>
        </div>
      </div>

      <div className={styles.btnRow}>
        <button className={styles.btnPrimary} onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
        <a href="/" target="_blank" className={styles.btnSecondary} style={{ textDecoration: "none", textAlign: "center" }}>
          Ver Landing Page →
        </a>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
