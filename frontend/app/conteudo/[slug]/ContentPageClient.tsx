"use client";

import { useEffect, useState } from "react";
import { BlockList, type Block } from "@/components/content/BlockView";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Related = { slug: string; title: string; theme?: string | null };
type Page = {
  slug: string; title: string; theme?: string | null; blocks: Block[];
  gateHeadline?: string | null; gateSubtext?: string | null;
  ctaText?: string | null; ctaUrl?: string | null;
  headScripts?: string | null; related: Related[];
};

const LEAD_KEY = "cz_lead";

export default function ContentPageClient({ slug }: { slug: string }) {
  const [page, setPage] = useState<Page | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Gate form
  const [mode, setMode] = useState<"form" | "confirm">("form");
  const [form, setForm] = useState({ name: "", whatsapp: "", email: "" });
  const [confirmPhone, setConfirmPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [gateMsg, setGateMsg] = useState("");

  // Load the page + recognize a returning lead (same device) via localStorage.
  useEffect(() => {
    fetch(`${API}/api/content/resolve/${encodeURIComponent(slug)}?track=1`)
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); return; }
        const d = await r.json();
        setPage(d.page);
      })
      .catch(() => setNotFound(true));

    try {
      const saved = JSON.parse(localStorage.getItem(LEAD_KEY) || "null");
      if (saved && saved.email) setUnlocked(true); // already a known lead → no gate
    } catch {}
  }, [slug]);

  // Inject optional per-page tracking pixels into <head>.
  useEffect(() => {
    const raw = page?.headScripts?.trim();
    if (!raw) return;
    const tmpl = document.createElement("template");
    tmpl.innerHTML = raw;
    const added: HTMLElement[] = [];
    tmpl.content.childNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      const el = node as HTMLElement;
      if (el.tagName === "SCRIPT") {
        const s = document.createElement("script");
        for (const a of Array.from(el.attributes)) s.setAttribute(a.name, a.value);
        s.text = el.textContent || "";
        document.head.appendChild(s); added.push(s);
      } else { document.head.appendChild(el); added.push(el); }
    });
    return () => added.forEach((n) => n.parentNode?.removeChild(n));
  }, [page?.headScripts]);

  const saveLead = (data: { name?: string; email?: string; whatsapp?: string }) => {
    try {
      const prev = JSON.parse(localStorage.getItem(LEAD_KEY) || "null") || {};
      localStorage.setItem(LEAD_KEY, JSON.stringify({ ...prev, ...data, _v: prev._v || "v2", savedAt: prev.savedAt || new Date().toISOString() }));
    } catch {}
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.whatsapp || !form.email) { setGateMsg("Preencha nome, WhatsApp e e-mail."); return; }
    setSubmitting(true); setGateMsg("");
    try {
      const r = await fetch(`${API}/api/content/lead`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); setGateMsg(d.error || "Erro. Tente de novo."); return; }
      saveLead(form);
      setUnlocked(true);
    } catch { setGateMsg("Erro de conexão. Tente de novo."); }
    finally { setSubmitting(false); }
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPhone) { setGateMsg("Informe seu WhatsApp."); return; }
    setSubmitting(true); setGateMsg("");
    try {
      const r = await fetch(`${API}/api/content/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, whatsapp: confirmPhone }),
      });
      const d = await r.json().catch(() => ({}));
      if (d.found) { saveLead({ whatsapp: confirmPhone }); setUnlocked(true); }
      else { setGateMsg("Não encontramos esse WhatsApp. Faça o cadastro abaixo."); setMode("form"); setForm((f) => ({ ...f, whatsapp: confirmPhone })); }
    } catch { setGateMsg("Erro de conexão. Tente de novo."); }
    finally { setSubmitting(false); }
  };

  if (notFound) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Conteúdo não encontrado</h1>
        <p style={{ color: "var(--text-tertiary)" }}>Este link pode ter expirado ou mudado.</p>
        <a href="https://czero.sbs" style={ctaStyle}>Ir para o Código Zero</a>
      </main>
    );
  }
  if (!page) return <main style={{ ...wrap, color: "var(--text-tertiary)" }}>Carregando…</main>;

  // ── GATE ────────────────────────────────────────────────────────────────
  if (!unlocked) {
    return (
      <main style={wrap}>
        <div style={{ maxWidth: 440, width: "100%" }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>{page.gateHeadline || page.title}</h1>
          <p style={{ color: "var(--text-tertiary)", margin: "0 0 20px" }}>
            {page.gateSubtext || "Preencha pra liberar o conteúdo. É rápido e gratuito."}
          </p>

          {mode === "form" ? (
            <form onSubmit={submitForm} style={{ display: "grid", gap: 10 }}>
              <input style={input} placeholder="Seu nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input style={input} placeholder="WhatsApp (ex.: 84 123 4567)" inputMode="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
              <input style={input} placeholder="Seu melhor e-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <button style={ctaStyle} disabled={submitting} type="submit">{submitting ? "Liberando…" : "Liberar conteúdo"}</button>
              <button type="button" onClick={() => { setMode("confirm"); setGateMsg(""); }} style={linkBtn}>Já se cadastrou? Confirme seu WhatsApp</button>
            </form>
          ) : (
            <form onSubmit={submitConfirm} style={{ display: "grid", gap: 10 }}>
              <input style={input} placeholder="Seu WhatsApp" inputMode="tel" value={confirmPhone} onChange={(e) => setConfirmPhone(e.target.value)} />
              <button style={ctaStyle} disabled={submitting} type="submit">{submitting ? "Confirmando…" : "Confirmar e liberar"}</button>
              <button type="button" onClick={() => { setMode("form"); setGateMsg(""); }} style={linkBtn}>Primeira vez aqui? Fazer cadastro</button>
            </form>
          )}
          {gateMsg && <p style={{ color: "#f0a", fontSize: 13, marginTop: 12 }}>{gateMsg}</p>}
        </div>
      </main>
    );
  }

  // ── CONTENT ───────────────────────────────────────────────────────────────
  return (
    <main style={{ ...wrap, alignItems: "stretch" }}>
      <article style={{ maxWidth: 720, width: "100%", margin: "0 auto" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 20px" }}>{page.title}</h1>
        <BlockList blocks={page.blocks} />

        {/* CTA final → Código Zero */}
        <div style={{ marginTop: 40, paddingTop: 28, borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <a href={page.ctaUrl || "https://czero.sbs"} style={{ ...ctaStyle, display: "inline-block", maxWidth: 480 }}>
            {page.ctaText || "Quero continuar aprendendo no Código Zero"}
          </a>
        </div>

        {/* Veja também */}
        {page.related?.length > 0 && (
          <div style={{ marginTop: 36 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 12 }}>Veja também</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {page.related.map((r) => (
                <a key={r.slug} href={`/conteudo/${r.slug}`} style={relCard}>
                  <span style={{ fontWeight: 600 }}>{r.title}</span>
                  {r.theme && <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}> · {r.theme}</span>}
                </a>
              ))}
            </div>
          </div>
        )}
      </article>
    </main>
  );
}

// ── Inline styles (CSS vars come from globals.css, same as the landing) ─────
const wrap: React.CSSProperties = {
  minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", gap: 8, padding: "40px 20px",
  background: "var(--bg-base)", color: "var(--text-primary)",
};
const input: React.CSSProperties = {
  padding: "13px 14px", borderRadius: 10, border: "1px solid var(--border)",
  background: "var(--bg-elevated, rgba(255,255,255,0.04))", color: "var(--text-primary)", fontSize: 15, width: "100%",
};
const ctaStyle: React.CSSProperties = {
  padding: "14px 22px", borderRadius: 10, background: "var(--accent)", color: "var(--accent-fg)",
  fontWeight: 700, fontSize: 16, border: "none", cursor: "pointer", textDecoration: "none", textAlign: "center", width: "100%",
};
const linkBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--text-tertiary)", fontSize: 13, cursor: "pointer", textDecoration: "underline", padding: 4,
};
const relCard: React.CSSProperties = {
  display: "block", padding: "14px 16px", borderRadius: 10, border: "1px solid var(--border)",
  textDecoration: "none", color: "var(--text-primary)",
};
