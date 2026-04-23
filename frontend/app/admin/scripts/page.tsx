"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

const CATEGORIES = [
  { value: "primeira_abordagem", label: "Primeira Abordagem" },
  { value: "negociacao", label: "Negociação" },
  { value: "prompts_copy", label: "Prompts & Copy" },
  { value: "follow_up", label: "Follow-Up" },
  { value: "fechamento", label: "Fechamento" },
];

export default function AdminScripts() {
  const [scripts, setScripts] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState("");

  const load = () => {
    fetch(`${API}/api/admin/scripts`, { headers: hdr() })
      .then(r => r.json()).then(d => setScripts(d.scripts || []));
  };
  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const save = async () => {
    const method = editing.id ? "PATCH" : "POST";
    const url = editing.id ? `${API}/api/admin/scripts/${editing.id}` : `${API}/api/admin/scripts`;
    await fetch(url, { method, headers: hdr(), body: JSON.stringify(editing) });
    showToast(editing.id ? "Script atualizado ✓" : "Script criado ✓");
    setEditing(null); load();
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Remover script "${title}"?`)) return;
    await fetch(`${API}/api/admin/scripts/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Script removido ✓"); load();
  };

  // Group by category
  const grouped = scripts.reduce((acc: Record<string, any[]>, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Banco de Scripts</h1>
        <p className={styles.pageDesc}>{scripts.length} scripts em {Object.keys(grouped).length} categorias</p>
      </div>

      <div className={styles.btnRow} style={{ marginBottom: 24 }}>
        <button className={styles.btnPrimary} onClick={() => setEditing({ title: "", category: "primeira_abordagem", content: "", icon: "📝", sortOrder: 0 })}>
          + Novo Script
        </button>
      </div>

      {CATEGORIES.map(cat => {
        const catScripts = grouped[cat.value] || [];
        if (catScripts.length === 0) return null;
        return (
          <div key={cat.value} className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.cardTitle}>{cat.label}</h3>
              <span className={`${styles.badge} ${styles.badgeTeal}`}>{catScripts.length}</span>
            </div>
            <table className={styles.table}>
              <thead><tr><th>Título</th><th>Preview</th><th>Ações</th></tr></thead>
              <tbody>
                {catScripts.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.icon || "📝"} {s.title}</td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#666" }}>{s.content.slice(0, 80)}...</td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={() => setEditing({ ...s })}>Editar</button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => remove(s.id, s.title)}>Remover</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}

      {editing && (
        <div className={styles.modalOverlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editing.id ? "Editar Script" : "Novo Script"}</h2>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Título</label>
                <input className={styles.formInput} value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Categoria</label>
                <select className={styles.formSelect} value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ícone (emoji)</label>
                <input className={styles.formInput} value={editing.icon || ""} onChange={e => setEditing({ ...editing, icon: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ordem</label>
                <input className={styles.formInput} type="number" value={editing.sortOrder || 0} onChange={e => setEditing({ ...editing, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Conteúdo do Script</label>
                <textarea className={styles.formTextarea} style={{ minHeight: 200 }} value={editing.content} onChange={e => setEditing({ ...editing, content: e.target.value })} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={save}>Salvar</button>
              <button className={styles.btnSecondary} onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
