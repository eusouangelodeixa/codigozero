"use client";
import { useState, useEffect, useRef } from "react";
import styles from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import { AdminPage, DataTable, StatusBadge, RowActions, type Column } from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SITE = "https://czero.sbs"; // public domain that serves /conteudo/{slug}
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

type Block = { id: string; type: string; [k: string]: any };

const BLOCK_TYPES: { type: string; label: string; make: () => Block }[] = [
  { type: "heading", label: "Título", make: () => ({ id: uid(), type: "heading", level: 2, text: "" }) },
  { type: "text", label: "Texto", make: () => ({ id: uid(), type: "text", md: "" }) },
  { type: "copyblock", label: "Bloco copiável", make: () => ({ id: uid(), type: "copyblock", label: "", text: "" }) },
  { type: "image", label: "Imagem", make: () => ({ id: uid(), type: "image", url: "", alt: "", href: "" }) },
  { type: "file", label: "Arquivo (PDF)", make: () => ({ id: uid(), type: "file", label: "Baixar o material", url: "", name: "" }) },
  { type: "button", label: "Botão/Link", make: () => ({ id: uid(), type: "button", label: "", url: "" }) },
  { type: "video", label: "Vídeo (embed)", make: () => ({ id: uid(), type: "video", embedHtml: "" }) },
  { type: "divider", label: "Divisor", make: () => ({ id: uid(), type: "divider" }) },
  // ── Blocos do passo a passo (Central de Material) ──
  { type: "eyebrow", label: "Sobrelinha", make: () => ({ id: uid(), type: "eyebrow", text: "" }) },
  { type: "step", label: "Passo numerado", make: () => ({ id: uid(), type: "step", title: "", subtitle: "" }) },
  { type: "callout", label: "Callout / Atenção", make: () => ({ id: uid(), type: "callout", variant: "info", lead: "", text: "" }) },
  { type: "linkcard", label: "Card de link", make: () => ({ id: uid(), type: "linkcard", title: "", url: "", badge: "" }) },
];

function uid() {
  // crypto.randomUUID where available; cheap fallback otherwise.
  try { return crypto.randomUUID(); } catch { return `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
}

const emptyPage = () => ({
  id: "", slug: "", title: "", theme: "", status: "draft",
  blocks: [] as Block[], gateHeadline: "", gateSubtext: "",
  ctaText: "Quero continuar aprendendo no Código Zero",
  ctaUrl: "https://czero.sbs",
  relatedPageIds: [] as string[],
  metaTitle: "", metaDescription: "", ogImageUrl: "", headScripts: "",
});

export default function AdminConteudo() {
  const [pages, setPages] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };

  const load = () => {
    fetch(`${API}/api/admin/content-pages`, { headers: hdr() })
      .then(r => r.json()).then(d => setPages(d.pages || [])).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const openNew = () => setEditing(emptyPage());
  const openEdit = async (id: string) => {
    const r = await fetch(`${API}/api/admin/content-pages/${id}`, { headers: hdr() });
    const d = await r.json();
    if (d.page) setEditing({ ...emptyPage(), ...d.page, blocks: d.page.blocks || [], relatedPageIds: d.page.relatedPageIds || [] });
  };

  const save = async () => {
    if (!editing.title?.trim()) return alert("Dê um título à página.");
    setSaving(true);
    const method = editing.id ? "PATCH" : "POST";
    const url = editing.id ? `${API}/api/admin/content-pages/${editing.id}` : `${API}/api/admin/content-pages`;
    const r = await fetch(url, { method, headers: hdr(), body: JSON.stringify(editing) });
    setSaving(false);
    if (!r.ok) { const e = await r.json().catch(() => ({})); return alert(e.error || "Erro ao salvar"); }
    showToast("Página salva ✓");
    setEditing(null); load();
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Excluir a página "${title}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`${API}/api/admin/content-pages/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Página excluída ✓"); load();
  };

  const duplicate = async (id: string) => {
    const r = await fetch(`${API}/api/admin/content-pages/${id}/duplicate`, { method: "POST", headers: hdr() });
    if (!r.ok) { const e = await r.json().catch(() => ({})); return alert(e.error || "Erro ao duplicar"); }
    showToast("Página duplicada ✓ (rascunho)"); load();
  };

  // ── Block editor helpers ────────────────────────────────────────────────
  const setBlocks = (blocks: Block[]) => setEditing((p: any) => ({ ...p, blocks }));
  const addBlock = (type: string) => {
    const def = BLOCK_TYPES.find(b => b.type === type)!;
    setBlocks([...(editing.blocks || []), def.make()]);
  };
  const updateBlock = (i: number, patch: any) => {
    const next = [...editing.blocks]; next[i] = { ...next[i], ...patch }; setBlocks(next);
  };
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= editing.blocks.length) return;
    const next = [...editing.blocks]; [next[i], next[j]] = [next[j], next[i]]; setBlocks(next);
  };
  const removeBlock = (i: number) => setBlocks(editing.blocks.filter((_: any, k: number) => k !== i));
  // Drag-and-drop reorder: move the dragged block to the drop target's slot.
  const dropBlock = (target: number) => {
    if (dragIdx === null || dragIdx === target) { setDragIdx(null); return; }
    const next = [...editing.blocks];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(target, 0, moved);
    setBlocks(next);
    setDragIdx(null);
  };

  // Upload an image/PDF to the backend; returns the absolute URL + original name.
  const uploadFile = async (file: File): Promise<{ url: string; name: string } | null> => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API}/api/admin/content-pages/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` }, // no Content-Type → browser sets multipart boundary
      body: fd,
    });
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error || "Falha no upload"); return null; }
    const d = await r.json();
    return { url: d.url, name: d.name };
  };

  // ── LIST VIEW ───────────────────────────────────────────────────────────
  if (!editing) {
    const columns: Column<any>[] = [
      {
        key: "page", header: "Página", primaryOnMobile: true,
        render: (p) => (
          <div className={k.cellStack}>
            <span className={k.cellMain}>{p.title}</span>
            <a href={`${SITE}/conteudo/${p.slug}`} target="_blank" rel="noreferrer" className={k.cellSub}>
              /conteudo/{p.slug} ↗
            </a>
          </div>
        ),
      },
      { key: "theme", header: "Tema", render: (p) => p.theme || <span className={k.cellMuted}>—</span> },
      {
        key: "status", header: "Status",
        render: (p) => (
          <StatusBadge tone={p.status === "published" ? "good" : "neutral"} noDot>
            {p.status === "published" ? "Publicada" : "Rascunho"}
          </StatusBadge>
        ),
      },
      { key: "leads", header: "Inscritos", align: "right", render: (p) => <b>{p.leadCount}</b> },
      { key: "views", header: "Views", align: "right", render: (p) => p.viewCount },
      {
        key: "conv", header: "Conversão", align: "right",
        render: (p) => `${p.viewCount > 0 ? Math.round((p.leadCount / p.viewCount) * 100) : 0}%`,
      },
    ];
    const rowActions = (p: any) => (
      <RowActions items={[
        { label: "Editar", onClick: () => openEdit(p.id) },
        { label: "Duplicar", onClick: () => duplicate(p.id) },
        { label: "Excluir", onClick: () => remove(p.id, p.title), danger: true },
      ]} />
    );
    return (
      <>
        <AdminPage
          title="Iscas"
          actions={<button className={`${k.btn} ${k.btnPrimary}`} onClick={openNew}>+ Nova página</button>}
        >
          <DataTable
            columns={columns}
            rows={pages}
            getRowKey={(p) => p.id}
            empty={{ title: "Nenhuma página ainda", desc: "Crie a primeira isca." }}
            rowActions={rowActions}
          />
        </AdminPage>
        {toast && <div className={styles.toast}>{toast}</div>}
      </>
    );
  }

  // ── EDITOR VIEW ─────────────────────────────────────────────────────────
  const related = pages.filter(p => p.id && p.id !== editing.id);
  return (
    <>
    <AdminPage
      title={editing.id ? "Editar página" : "Nova página"}
      actions={
        <>
          <button className={`${k.btn} ${k.btnSecondary}`} onClick={() => setEditing(null)}>Voltar</button>
          <button className={`${k.btn} ${k.btnPrimary}`} onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
        </>
      }
    >

      {/* Basics */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Básico</h3></div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Título</label>
            <input className={styles.formInput} value={editing.title}
                   onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Ex.: 5 scripts de prospecção no WhatsApp" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Slug (link)</label>
            <input className={styles.formInput} value={editing.slug}
                   onChange={e => setEditing({ ...editing, slug: e.target.value })} placeholder="(automático a partir do título)" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Tema (usado no "veja também")</label>
            <input className={styles.formInput} value={editing.theme}
                   onChange={e => setEditing({ ...editing, theme: e.target.value })} placeholder="Ex.: Prospecção" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Status</label>
            <select className={styles.formSelect} value={editing.status}
                    onChange={e => setEditing({ ...editing, status: e.target.value })}>
              <option value="draft">Rascunho</option>
              <option value="published">Publicada</option>
            </select>
          </div>
        </div>
      </div>

      {/* Gate */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Formulário (gate)</h3></div>
        <div className={styles.formGrid}>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Chamada do formulário</label>
            <input className={styles.formInput} value={editing.gateHeadline}
                   onChange={e => setEditing({ ...editing, gateHeadline: e.target.value })} placeholder="Ex.: Preencha pra liberar o conteúdo" />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Subtexto</label>
            <input className={styles.formInput} value={editing.gateSubtext}
                   onChange={e => setEditing({ ...editing, gateSubtext: e.target.value })} placeholder="Ex.: É rápido e gratuito." />
          </div>
        </div>
      </div>

      {/* Blocks */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Conteúdo (blocos)</h3></div>
        {(editing.blocks || []).map((b: Block, i: number) => (
          <div key={b.id}
               onDragOver={(e) => e.preventDefault()}
               onDrop={() => dropBlock(i)}
               style={{ border: dragIdx === i ? "1px dashed var(--accent)" : "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10, opacity: dragIdx === i ? 0.5 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)}
                      title="Arraste para reordenar" style={{ cursor: "grab", color: "var(--text-tertiary)", userSelect: "none", fontSize: 16 }}>⠿</span>
                <strong style={{ fontSize: 13 }}>{BLOCK_TYPES.find(t => t.type === b.type)?.label || b.type}</strong>
              </span>
              <div className={styles.actions}>
                <button className={styles.actionBtn} onClick={() => moveBlock(i, -1)} disabled={i === 0}>↑</button>
                <button className={styles.actionBtn} onClick={() => moveBlock(i, 1)} disabled={i === editing.blocks.length - 1}>↓</button>
                <button className={styles.actionBtnDanger} onClick={() => removeBlock(i)}>Remover</button>
              </div>
            </div>
            <BlockEditor block={b} onChange={(patch: any) => updateBlock(i, patch)} uploadFile={uploadFile} />
          </div>
        ))}
        <div className={styles.btnRow} style={{ flexWrap: "wrap", marginTop: 8 }}>
          {BLOCK_TYPES.map(t => (
            <button key={t.type} className={styles.btnSecondary} onClick={() => addBlock(t.type)}>+ {t.label}</button>
          ))}
        </div>
      </div>

      {/* CTA + related */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>CTA final & recomendações</h3></div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Texto do CTA</label>
            <input className={styles.formInput} value={editing.ctaText}
                   onChange={e => setEditing({ ...editing, ctaText: e.target.value })} />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Link do CTA</label>
            <input className={styles.formInput} value={editing.ctaUrl}
                   onChange={e => setEditing({ ...editing, ctaUrl: e.target.value })} placeholder="https://czero.sbs" />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Veja também (páginas relacionadas)</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {related.length === 0 && <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Crie outras páginas para recomendá-las aqui.</span>}
              {related.map(rp => {
                const checked = (editing.relatedPageIds || []).includes(rp.id);
                return (
                  <label key={rp.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}>
                    <input type="checkbox" checked={checked} onChange={() => {
                      const ids = new Set(editing.relatedPageIds || []);
                      checked ? ids.delete(rp.id) : ids.add(rp.id);
                      setEditing({ ...editing, relatedPageIds: [...ids] });
                    }} />
                    {rp.title}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* SEO / link preview */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Preview do link (Instagram/SEO)</h3></div>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Título do preview</label>
            <input className={styles.formInput} value={editing.metaTitle}
                   onChange={e => setEditing({ ...editing, metaTitle: e.target.value })} placeholder="(usa o título da página se vazio)" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Imagem do preview</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className={styles.formInput} value={editing.ogImageUrl}
                     onChange={e => setEditing({ ...editing, ogImageUrl: e.target.value })} placeholder="https://… ou envie →" />
              <UploadBtn accept="image/*" label="Enviar" uploadFile={uploadFile} onDone={(r) => setEditing((p: any) => ({ ...p, ogImageUrl: r.url }))} />
            </div>
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Descrição do preview</label>
            <textarea className={styles.formTextarea} value={editing.metaDescription}
                      onChange={e => setEditing({ ...editing, metaDescription: e.target.value })} rows={2} />
          </div>
          <div className={styles.formGroupFull}>
            <label className={styles.formLabel}>Pixels de rastreamento (opcional, &lt;head&gt;)</label>
            <textarea className={styles.formTextarea} value={editing.headScripts}
                      onChange={e => setEditing({ ...editing, headScripts: e.target.value })} rows={2} placeholder="<script>…</script>" />
          </div>
        </div>
      </div>

      <div className={styles.btnRow} style={{ justifyContent: "flex-end", marginBottom: 40 }}>
        <button className={styles.btnSecondary} onClick={() => setEditing(null)}>Voltar</button>
        <button className={styles.btnPrimary} onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
      </div>
    </AdminPage>
    {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}

// Per-type field editor.
function BlockEditor({ block, onChange, uploadFile }: { block: Block; onChange: (patch: any) => void; uploadFile: (f: File) => Promise<{ url: string; name: string } | null> }) {
  const s = styles as any;
  if (block.type === "heading") return (
    <div style={{ display: "flex", gap: 8 }}>
      <select className={s.formSelect} style={{ maxWidth: 90 }} value={block.level} onChange={e => onChange({ level: Number(e.target.value) })}>
        <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
      </select>
      <input className={s.formInput} value={block.text} onChange={e => onChange({ text: e.target.value })} placeholder="Texto do título" />
    </div>
  );
  if (block.type === "text") return (
    <textarea className={s.formTextarea} rows={4} value={block.md} onChange={e => onChange({ md: e.target.value })}
              placeholder="Texto. Suporta markdown: **negrito**, [link](url), listas com -" />
  );
  if (block.type === "copyblock") return (
    <div style={{ display: "grid", gap: 8 }}>
      <input className={s.formInput} value={block.label} onChange={e => onChange({ label: e.target.value })} placeholder="Rótulo (ex.: Script 1) — opcional" />
      <textarea className={s.formTextarea} rows={3} value={block.text} onChange={e => onChange({ text: e.target.value })} placeholder="Texto que o lead vai copiar com 1 clique" />
    </div>
  );
  if (block.type === "image") return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input className={s.formInput} value={block.url} onChange={e => onChange({ url: e.target.value })} placeholder="URL da imagem ou envie →" />
        <UploadBtn accept="image/*" label="Enviar" uploadFile={uploadFile} onDone={(r) => onChange({ url: r.url })} />
      </div>
      {block.url && <img src={block.url} alt="" style={{ maxWidth: 160, borderRadius: 8 }} />}
      <input className={s.formInput} value={block.alt} onChange={e => onChange({ alt: e.target.value })} placeholder="Texto alternativo (alt) — opcional" />
      <input className={s.formInput} value={block.href} onChange={e => onChange({ href: e.target.value })} placeholder="Link ao clicar — opcional" />
    </div>
  );
  if (block.type === "file") return (
    <div style={{ display: "grid", gap: 8 }}>
      <input className={s.formInput} value={block.label} onChange={e => onChange({ label: e.target.value })} placeholder="Texto do botão (ex.: Baixar o PDF)" />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <UploadBtn accept="application/pdf" label="Enviar PDF" uploadFile={uploadFile} onDone={(r) => onChange({ url: r.url, name: r.name })} />
        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{block.url ? `${block.name || "arquivo"} ✓` : "nenhum arquivo"}</span>
      </div>
    </div>
  );
  if (block.type === "button") return (
    <div style={{ display: "flex", gap: 8 }}>
      <input className={s.formInput} value={block.label} onChange={e => onChange({ label: e.target.value })} placeholder="Texto do botão" />
      <input className={s.formInput} value={block.url} onChange={e => onChange({ url: e.target.value })} placeholder="https://…" />
    </div>
  );
  if (block.type === "video") return (
    <textarea className={s.formTextarea} rows={3} value={block.embedHtml} onChange={e => onChange({ embedHtml: e.target.value })}
              placeholder="Cole aqui o código de embed do vídeo (iframe Kilax/YouTube), igual à VSL" />
  );
  if (block.type === "divider") return <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Linha divisória</div>;
  if (block.type === "eyebrow") return (
    <input className={s.formInput} value={block.text} onChange={e => onChange({ text: e.target.value })}
           placeholder="Sobrelinha (ex.: COPIA E MANDA PRO CLAUDE CODE · PASSO 3)" />
  );
  if (block.type === "step") return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input className={s.formInput} style={{ maxWidth: 110 }} type="number" value={block.number ?? ""} onChange={e => onChange({ number: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="Nº (auto)" />
        <input className={s.formInput} value={block.title} onChange={e => onChange({ title: e.target.value })} placeholder="Título do passo (ex.: Baixe o Obsidian)" />
      </div>
      <input className={s.formInput} value={block.subtitle} onChange={e => onChange({ subtitle: e.target.value })} placeholder="Subtítulo do passo — opcional" />
    </div>
  );
  if (block.type === "callout") return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <select className={s.formSelect} style={{ maxWidth: 130 }} value={block.variant || "info"} onChange={e => onChange({ variant: e.target.value })}>
          <option value="info">Info (teal)</option>
          <option value="warning">Atenção (âmbar)</option>
        </select>
        <input className={s.formInput} value={block.lead} onChange={e => onChange({ lead: e.target.value })} placeholder="Início em destaque (ex.: Atenção:) — opcional" />
      </div>
      <textarea className={s.formTextarea} rows={3} value={block.text} onChange={e => onChange({ text: e.target.value })} placeholder="Texto do callout. Suporta **negrito**, [link](url)." />
    </div>
  );
  if (block.type === "linkcard") return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input className={s.formInput} value={block.title} onChange={e => onChange({ title: e.target.value })} placeholder="Título (ex.: Baixar o Obsidian)" />
        <input className={s.formInput} style={{ maxWidth: 120 }} value={block.badge} onChange={e => onChange({ badge: e.target.value })} placeholder="Selo (GRÁTIS)" />
      </div>
      <input className={s.formInput} value={block.url} onChange={e => onChange({ url: e.target.value })} placeholder="https://…" />
    </div>
  );
  return null;
}

// Small button that opens a file picker and uploads via uploadFile().
function UploadBtn({ accept, label, uploadFile, onDone }: {
  accept: string;
  label: string;
  uploadFile: (f: File) => Promise<{ url: string; name: string } | null>;
  onDone: (r: { url: string; name: string }) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button type="button" className={styles.btnSecondary} disabled={busy} onClick={() => ref.current?.click()} style={{ whiteSpace: "nowrap" }}>
        {busy ? "Enviando…" : label}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          const r = await uploadFile(f);
          setBusy(false);
          if (r) onDone(r);
          e.target.value = "";
        }}
      />
    </>
  );
}
