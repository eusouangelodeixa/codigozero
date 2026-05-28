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
  headScripts: string | null;
}

const MAX_BYTES = 8000;

export default function CoproducerConfig() {
  const [me, setMe] = useState<MeData | null>(null);
  const [scripts, setScripts] = useState("");
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
    setScripts(data.headScripts || "");
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ headScripts: scripts }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Erro ao salvar");
      setToast({ kind: "ok", msg: "Scripts salvos." });
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

  const bytes = new Blob([scripts]).size;
  const overLimit = bytes > MAX_BYTES;

  return (
    <div style={{ padding: 24, maxWidth: 880 }}>
      <header className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Configurações</span>
        <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Settings size={20} /> Rastreio &amp; pixels
        </h1>
        <p className={styles.pageDesc}>
          Cole aqui o snippet do seu Meta Pixel, Google Analytics, TikTok Pixel etc. Vai ser injetado
          dentro do &lt;head&gt; só na sua landing <code>/c/{me.code}</code> — não interfere na principal.
        </p>
      </header>

      {/* VSL (read-only) */}
      <section
        style={{
          padding: 16,
          marginBottom: 18,
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
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 10px" }}>
          O vídeo de vendas é configurado pelo superadmin. Se quiser uma VSL própria, fala com a equipe.
        </p>
        <pre
          style={{
            margin: 0,
            padding: 12,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 8,
            color: "var(--text-secondary)",
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            maxHeight: 140,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {me.vslEmbedHtml || "(usando a VSL padrão do sistema)"}
        </pre>
      </section>

      {/* Pixels (editable) */}
      <section
        style={{
          padding: 16,
          marginBottom: 18,
          background: "var(--bg-card, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-tertiary)" }}>
            HTML / scripts injetados em &lt;head&gt;
          </span>
          <span style={{ fontSize: 11, color: overLimit ? "#ef4444" : "var(--text-tertiary)", fontFamily: "ui-monospace, monospace" }}>
            {bytes.toLocaleString()} / {MAX_BYTES.toLocaleString()} bytes
          </span>
        </div>
        <textarea
          value={scripts}
          onChange={(e) => setScripts(e.target.value)}
          placeholder={`<!-- Meta Pixel Code -->\n<script>\n  !function(f,b,e,v,n,t,s)...\n  fbq('init', '1234567890');\n  fbq('track', 'PageView');\n</script>\n<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=1234567890&ev=PageView&noscript=1"/></noscript>`}
          style={{
            width: "100%",
            minHeight: 320,
            padding: 12,
            background: "rgba(0,0,0,0.35)",
            border: `1px solid ${overLimit ? "#ef4444" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 12,
            fontFamily: "ui-monospace, monospace",
            resize: "vertical",
            lineHeight: 1.45,
          }}
        />
        <p
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "var(--text-tertiary)",
            display: "flex",
            gap: 6,
            alignItems: "flex-start",
          }}
        >
          <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
          <span>
            Cole o snippet completo (com <code>&lt;script&gt;</code>, <code>&lt;noscript&gt;</code>, etc). Só será aplicado em <code>{me.landingUrl}</code>.
          </span>
        </p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          {toast && (
            <span
              style={{
                fontSize: 12,
                padding: "8px 12px",
                borderRadius: 8,
                color: toast.kind === "ok" ? "#22c55e" : "#ef4444",
                background: toast.kind === "ok" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                marginRight: "auto",
                alignSelf: "center",
              }}
            >
              {toast.msg}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || overLimit}
            style={{
              padding: "10px 22px",
              borderRadius: 10,
              border: "none",
              background: overLimit ? "rgba(239,68,68,0.4)" : "linear-gradient(135deg, #a855f7, #7c3aed)",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: saving || overLimit ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Save size={14} /> {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}
