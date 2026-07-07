"use client";

// Shared renderer for ContentPage typed blocks. Used by BOTH the gated
// standalone page (app/conteudo/[slug]) and the ungated Central de Material
// modal (app/central). Styling is inline using the app's GLOBAL teal design
// tokens (var(--accent), var(--bg-elevated), …) so it renders on-brand on both
// surfaces. Serif titles use var(--lp-display) when a Playfair layout is in
// scope (LP/Central), falling back to Georgia elsewhere (/conteudo).

import React, { useState } from "react";

export type Block = { id?: string; type: string; [k: string]: any };

// ── Minimal, safe markdown → HTML for text/callout blocks (admin-authored) ──
function esc(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string) {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
function mdToHtml(src: string) {
  const lines = (src || "").split(/\r?\n/);
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) { out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("- ")) { list.push(line.slice(2)); continue; }
    flush();
    if (line) out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join("");
}

const serif = "var(--lp-display), Georgia, 'Times New Roman', serif";

const linkStyle: React.CSSProperties = {
  padding: "14px 22px", borderRadius: 10, background: "var(--accent)", color: "var(--accent-fg)",
  fontWeight: 700, fontSize: 16, border: "none", cursor: "pointer", textDecoration: "none",
  textAlign: "center", width: "100%",
};
const copyBtn: React.CSSProperties = {
  padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-fg)",
  fontWeight: 600, fontSize: 13, border: "none", cursor: "pointer",
};

export function BlockView({ block, stepNumber }: { block: Block; stepNumber?: number }) {
  const [copied, setCopied] = useState(false);

  if (block.type === "eyebrow") {
    return (
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)", margin: "24px 0 10px" }}>
        {block.text}
      </div>
    );
  }

  if (block.type === "heading") {
    const Tag = (`h${block.level || 2}`) as any;
    return <Tag style={{ fontWeight: 700, margin: "22px 0 10px" }}>{block.text}</Tag>;
  }

  if (block.type === "text") {
    return <div style={{ lineHeight: 1.7, margin: "0 0 14px" }} dangerouslySetInnerHTML={{ __html: mdToHtml(block.md || "") }} />;
  }

  // Numbered step: teal tile (serif digit) + serif italic title + subtitle.
  if (block.type === "step") {
    const n = block.number ?? stepNumber ?? "";
    return (
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", margin: "26px 0 12px" }}>
        <div style={{
          flexShrink: 0, width: 40, height: 40, borderRadius: 10, background: "var(--accent)",
          color: "var(--accent-fg)", fontFamily: serif, fontStyle: "italic", fontWeight: 700,
          fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
        }}>{n}</div>
        <div>
          <div style={{ fontFamily: serif, fontStyle: "italic", fontWeight: 700, fontSize: 22, lineHeight: 1.15, color: "var(--text-primary)" }}>{block.title}</div>
          {block.subtitle && <div style={{ color: "var(--text-secondary)", fontSize: 15, lineHeight: 1.5, marginTop: 6 }}>{block.subtitle}</div>}
        </div>
      </div>
    );
  }

  // Callout: left accent border + faint tint. Lead-in (bold/mono) + markdown body.
  if (block.type === "callout") {
    const warn = block.variant === "warning";
    const accent = warn ? "var(--color-warning, #F59E0B)" : "var(--accent)";
    return (
      <div style={{
        borderLeft: `3px solid ${accent}`, borderRadius: 8, padding: "14px 16px", margin: "0 0 16px",
        background: warn ? "rgba(245,158,11,0.06)" : "rgba(45,212,191,0.06)",
      }}>
        {block.lead && <strong style={{ color: "var(--text-primary)" }}>{block.lead} </strong>}
        <span style={{ color: "var(--text-secondary)", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: mdToHtml(block.text || "").replace(/^<p>|<\/p>$/g, "") }} />
      </div>
    );
  }

  // Resource link card: title + optional badge chip + mono URL + ↗.
  if (block.type === "linkcard") {
    if (!block.url) return null;
    let host = block.url;
    try { host = new URL(block.url).host + (new URL(block.url).pathname !== "/" ? new URL(block.url).pathname : ""); } catch {}
    return (
      <a href={block.url} target="_blank" rel="noopener noreferrer" style={{
        display: "block", border: "1px solid var(--border-default, rgba(255,255,255,0.1))", borderRadius: 12,
        padding: 16, margin: "0 0 16px", textDecoration: "none", background: "rgba(45,212,191,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 15 }}>{block.title || "Abrir link"}</span>
          {block.badge && <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--accent-fg)", background: "var(--accent)", borderRadius: 6, padding: "2px 8px" }}>{block.badge}</span>}
        </div>
        <div style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 13, color: "var(--accent)", overflowWrap: "anywhere", wordBreak: "break-word" }}>{host} ↗</div>
      </a>
    );
  }

  if (block.type === "copyblock") {
    const copy = () => { navigator.clipboard?.writeText(block.text || "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); };
    return (
      <div style={{ border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 12, padding: 16, margin: "0 0 16px", background: "rgba(45,212,191,0.05)" }}>
        {block.label && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{block.label}</div>}
        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word", lineHeight: 1.6, marginBottom: 12, fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: 14, color: "var(--text-primary)" }}>{block.text}</div>
        <button onClick={copy} style={copyBtn}>{copied ? "Copiado ✓" : "Copiar"}</button>
      </div>
    );
  }

  if (block.type === "image") {
    const img = <img src={block.url} alt={block.alt || ""} style={{ maxWidth: "100%", borderRadius: 12, display: "block", margin: "0 auto 16px" }} />;
    return block.href ? <a href={block.href} target="_blank" rel="noopener noreferrer">{img}</a> : img;
  }

  if (block.type === "button") {
    return <div style={{ margin: "0 0 16px" }}><a href={block.url} style={{ ...linkStyle, display: "inline-block" }}>{block.label || "Abrir"}</a></div>;
  }

  if (block.type === "file") {
    if (!block.url) return null;
    return <div style={{ margin: "0 0 16px" }}><a href={block.url} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, display: "inline-block" }}>{block.label || "Baixar arquivo"}</a></div>;
  }

  if (block.type === "video") {
    return <div style={{ margin: "0 0 18px", borderRadius: 12, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: block.embedHtml || "" }} />;
  }

  if (block.type === "divider") {
    return <hr style={{ border: "none", borderTop: "1px solid var(--border, rgba(255,255,255,0.08))", margin: "24px 0" }} />;
  }

  return null;
}

// Renders an ordered list of blocks, auto-numbering `step` blocks that don't
// carry an explicit number.
export function BlockList({ blocks }: { blocks: Block[] }) {
  let stepN = 0;
  return (
    <>
      {(blocks || []).map((b, i) => {
        const n = b.type === "step" ? (b.number ?? ++stepN) : undefined;
        return <BlockView key={b.id || i} block={b} stepNumber={n} />;
      })}
    </>
  );
}
