"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SITE = "https://czero.sbs"; // public domain that serves /conteudo/{slug}
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

type Block = { id: string; type: string; [k: string]: any };

const BLOCK_TYPES: { type: string; label: string; make: () => Block }[] = [
  { type: "heading", label: "Título", make: () => ({ id: uid(), type: "heading", level: 2, text: "" }) },
  { type: "text", label: "Texto", make: () => ({ id: uid(), type: "text", md: "" }) },
  { type: "copyblock", label: "Bloco copiável", make: () => ({ id: uid(), type: "copyblock", label: "", text: "" }) },
  { type: "image", label: "Imagem", make: () => ({ id: uid(), type: "image", url: "", alt: "", href: "" }) },
  { type: "button", label: "Botão/Link", make: () => ({ id: uid(), type: "button", label: "", url: "" }) },
  { type: "video", label: "Vídeo (embed)", make: () => ({ id: uid(), type: "video", embedHtml: "" }) },
  { type: "divider", label: "Divisor", make: () => ({ id: uid(), type: "divider" }) },
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

  // ── LIST VIEW ───────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Páginas de Conteúdo</h1>
            <p className={styles.pageDesc}>Iscas de funil: o lead preenche o form pra ver o conteúdo e vira lead.</p>
          </div>
          <button className={styles.btnPrimary} onClick={openNew}>+ Nova página</button>
        </div>

        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Página</th><th>Tema</th><th>Status</th>
                <th style={{ textAlign: "right" }}>Inscritos</th>
                <th style={{ textAlign: "right" }}>Views</th>
                <th style={{ textAlign: "right" }}>Conversão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pages.map(p => {
                const conv = p.viewCount > 0 ? Math.round((p.leadCount / p.viewCount) * 100) : 0;
                return (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.title}</div>
                      <a href={`${SITE}/conteudo/${p.slug}`} target="_blank" rel="noreferrer"
                         style={{ fontSize: 12, color: "var(--text-tertiary)" }}>/conteudo/{p.slug} ↗</a>
                    </td>
                    <td>{p.theme || "—"}</td>
                    <td>
                      <span className={`${styles.badge} ${p.status === "published" ? styles.badgeGreen : styles.badgeGray}`}>
                        {p.status === "published" ? "Publicada" : "Rascunho"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{p.leadCount}</td>
                    <td style={{ textAlign: "right" }}>{p.viewCount}</td>
                    <td style={{ textAlign: "right" }}>{conv}%</td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={() => openEdit(p.id)}>Editar</button>
                        <button className={styles.actionBtn} onClick={() => duplicate(p.id)}>Duplicar</button>
                        <button className={styles.actionBtnDanger} onClick={() => remove(p.id, p.title)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pages.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--text-tertiary)" }}>
                  Nenhuma página ainda. Crie a primeira isca.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {toast && <div className={styles.toast}>{toast}</div>}
      </div>
    );
  }

  // ── EDITOR VIEW ─────────────────────────────────────────────────────────
  const related = pages.filter(p => p.id && p.id !== editing.id);
  return (
    <div>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>{editing.id ? "Editar página" : "Nova página"}</h1>
          {editing.slug && <p className={styles.pageDesc}>{SITE}/conteudo/{editing.slug}</p>}
        </div>
        <div className={styles.btnRow}>
          <button className={styles.btnSecondary} onClick={() => setEditing(null)}>Voltar</button>
          <button className={styles.btnPrimary} onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>

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
            <BlockEditor block={b} onChange={(patch: any) => updateBlock(i, patch)} />
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
            <label className={styles.formLabel}>Imagem do preview (URL)</label>
            <input className={styles.formInput} value={editing.ogImageUrl}
                   onChange={e => setEditing({ ...editing, ogImageUrl: e.target.value })} placeholder="https://…/imagem.jpg" />
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
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}

// Per-type field editor.
function BlockEditor({ block, onChange }: { block: Block; onChange: (patch: any) => void }) {
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
      <input className={s.formInput} value={block.url} onChange={e => onChange({ url: e.target.value })} placeholder="URL da imagem" />
      <input className={s.formInput} value={block.alt} onChange={e => onChange({ alt: e.target.value })} placeholder="Texto alternativo (alt) — opcional" />
      <input className={s.formInput} value={block.href} onChange={e => onChange({ href: e.target.value })} placeholder="Link ao clicar — opcional" />
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
  return null;
}
