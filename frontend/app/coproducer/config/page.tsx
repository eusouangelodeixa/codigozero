"use client";

import { useEffect, useState } from "react";
import { Settings, Save, Eye, AlertCircle } from "lucide-react";
import styles from "../coproducer.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface MeData {
  id: string;
  code: string;
  landingUrl: string;
  vslEmbedHtml: string | null;
  metaPixelId: string | null;
  ga4Id: string | null;
  tiktokPixelId: string | null;
}

export default function CoproducerConfig() {
  const [me, setMe] = useState<MeData | null>(null);
  const [meta, setMeta] = useState("");
  const [ga4, setGa4] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const load = async () => {
    const token = localStorage.getItem("cz_token");
    if (!token) return;
    const r = await fetch(`${API_URL}/api/coproducer/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return;
    const data = await r.json();
    setMe(data);
    setMeta(data.metaPixelId || "");
    setGa4(data.ga4Id || "");
    setTiktok(data.tiktokPixelId || "");
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setToast(null);
    try {
      const token = localStorage.getItem("cz_token");
      const r = await fetch(`${API_URL}/api/coproducer/me/scripts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ metaPixelId: meta.trim(), ga4Id: ga4.trim(), tiktokPixelId: tiktok.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Erro ao salvar");
      setToast({ kind: "ok", msg: "Pixels salvos." });
      setTimeout(() => setToast(null), 3000);
    } catch (e: any) {
      setToast({ kind: "err", msg: e.message || "Erro ao salvar" });
    }
    setSaving(false);
  };

  if (!me) {
    return (
      <div style={{ padding: 24, color: "var(--text-tertiary)" }}>
        <span>Carregando…</span>
      </div>
    );
  }

  const field = (label: string, hint: string, value: string, onChange: (v: string) => void, placeholder: string) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box", padding: "11px 13px",
          background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 9, color: "var(--text-primary)", fontSize: 14,
          fontFamily: "ui-monospace, monospace",
        }}
      />
      <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--text-tertiary)" }}>{hint}</p>
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <header className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Configurações</span>
        <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Settings size={20} /> Rastreio &amp; pixels
        </h1>
        <p className={styles.pageDesc}>
          Informe apenas os <strong>IDs</strong> dos seus pixels. Nós montamos o código com segurança e
          injetamos só na sua landing <code>/c/{me.code}</code>.
        </p>
      </header>

      {/* VSL (read-only) */}
      <section
        style={{
          padding: 16, marginBottom: 18,
          background: "var(--bg-card, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Eye size={14} color="var(--text-tertiary)" />
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-tertiary)" }}>
            VSL da sua landing (definida pelo superadmin)
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>
          {me.vslEmbedHtml ? "VSL própria configurada pela equipe." : "Usando a VSL padrão do sistema. Para uma própria, fale com a equipe."}
        </p>
      </section>

      {/* Pixels por ID */}
      <section
        style={{
          padding: 18, marginBottom: 18,
          background: "var(--bg-card, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          borderRadius: 12,
        }}
      >
        {field("Meta Pixel ID", "Só os dígitos, ex: 1039972098622648", meta, setMeta, "1039972098622648")}
        {field("Google Analytics 4 (Measurement ID)", "Formato G-XXXXXXXXXX", ga4, setGa4, "G-ABCDE12345")}
        {field("TikTok Pixel ID", "O código do seu pixel no TikTok Ads", tiktok, setTiktok, "CabcDE12fGHij3kLmno4")}

        <p style={{ marginTop: 4, fontSize: 11.5, color: "var(--text-tertiary)", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            Por segurança já não aceitamos HTML colado — só os IDs. Aplicado apenas em <code>{me.landingUrl}</code>.
          </span>
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
          {toast && (
            <span
              style={{
                fontSize: 12, padding: "8px 12px", borderRadius: 8,
                color: toast.kind === "ok" ? "#22c55e" : "#ef4444",
                background: toast.kind === "ok" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                marginRight: "auto", alignSelf: "center",
              }}
            >
              {toast.msg}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: "10px 22px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff",
              fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 8,
            }}
          >
            <Save size={14} /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}
