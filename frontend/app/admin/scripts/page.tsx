"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminScripts() {
  const [folders, setFolders] = useState<any[]>([]);
  const [editingScript, setEditingScript] = useState<any>(null);
  const [editingFolder, setEditingFolder] = useState<any>(null);
  const [toast, setToast] = useState("");

  const load = () => {
    fetch(`${API}/api/admin/script-folders`, { headers: hdr() })
      .then(r => r.json()).then(d => setFolders(d.folders || []));
  };
  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // Folder Actions
  const saveFolder = async () => {
    const method = editingFolder.id ? "PATCH" : "POST";
    const url = editingFolder.id ? `${API}/api/admin/script-folders/${editingFolder.id}` : `${API}/api/admin/script-folders`;
    await fetch(url, { method, headers: hdr(), body: JSON.stringify(editingFolder) });
    showToast(editingFolder.id ? "Pasta atualizada ✓" : "Pasta criada ✓");
    setEditingFolder(null); load();
  };

  const removeFolder = async (id: string, name: string) => {
    if (!confirm(`Remover pasta "${name}" e TODOS os seus scripts?`)) return;
    await fetch(`${API}/api/admin/script-folders/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Pasta removida ✓"); load();
  };

  // Script Actions
  const saveScript = async () => {
    if (!editingScript.folderId) return alert("Selecione uma pasta para o script!");
    const method = editingScript.id ? "PATCH" : "POST";
    const url = editingScript.id ? `${API}/api/admin/scripts/${editingScript.id}` : `${API}/api/admin/scripts`;
    await fetch(url, { method, headers: hdr(), body: JSON.stringify(editingScript) });
    showToast(editingScript.id ? "Script atualizado ✓" : "Script criado ✓");
    setEditingScript(null); load();
  };

  const removeScript = async (id: string, title: string) => {
    if (!confirm(`Remover script "${title}"?`)) return;
    await fetch(`${API}/api/admin/scripts/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Script removido ✓"); load();
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Banco de Scripts & Pastas</h1>
        <p className={styles.pageDesc}>
          {folders.reduce((acc, f) => acc + (f.scripts?.length || 0), 0)} scripts organizados em {folders.length} pastas
        </p>
      </div>

      <div className={styles.btnRow} style={{ marginBottom: 24 }}>
        <button className={styles.btnPrimary} onClick={() => setEditingFolder({ name: "", icon: "📁", sortOrder: 0 })}>
          + Nova Pasta
        </button>
        <button className={styles.btnSecondary} onClick={() => {
            if (folders.length === 0) return alert("Crie uma pasta primeiro!");
            setEditingScript({ title: "", folderId: folders[0].id, content: "", icon: "📝", sortOrder: 0 })
          }}>
          + Novo Script
        </button>
      </div>

      {folders.length === 0 && (
        <div className={styles.card} style={{ textAlign: "center", padding: "40px" }}>
          <p style={{ color: "var(--text-secondary)" }}>Nenhuma pasta criada. Crie uma pasta primeiro para adicionar scripts.</p>
        </div>
      )}

      {folders.map(folder => (
        <div key={folder.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h3 className={styles.cardTitle}>{folder.icon} {folder.name}</h3>
              <span className={`${styles.badge} ${styles.badgeTeal}`}>{folder.scripts?.length || 0} scripts</span>
            </div>
            <div className={styles.actions}>
              <button className={styles.actionBtn} onClick={() => setEditingFolder({ ...folder })}>Editar Pasta</button>
              <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => removeFolder(folder.id, folder.name)}>Excluir Pasta</button>
            </div>
          </div>
          
          {folder.scripts && folder.scripts.length > 0 ? (
            <table className={styles.table}>
              <thead><tr><th>Título do Script</th><th>Preview</th><th>Ações</th></tr></thead>
              <tbody>
                {folder.scripts.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.icon || "📝"} {s.title}</td>
                    <td style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#666" }}>{s.content.slice(0, 80)}...</td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={() => setEditingScript({ ...s })}>Editar</button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => removeScript(s.id, s.title)}>Remover</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: "16px 24px", color: "var(--text-tertiary)", fontSize: 13 }}>Nenhum script nesta pasta.</div>
          )}
        </div>
      ))}

      {/* Modal - Folder */}
      {editingFolder && (
        <div className={styles.modalOverlay} onClick={() => setEditingFolder(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editingFolder.id ? "Editar Pasta" : "Nova Pasta"}</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Nome da Pasta</label>
                <input className={styles.formInput} value={editingFolder.name} onChange={e => setEditingFolder({ ...editingFolder, name: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ícone (emoji)</label>
                <input className={styles.formInput} value={editingFolder.icon || ""} onChange={e => setEditingFolder({ ...editingFolder, icon: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ordem</label>
                <input className={styles.formInput} type="number" value={editingFolder.sortOrder || 0} onChange={e => setEditingFolder({ ...editingFolder, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={saveFolder}>Salvar Pasta</button>
              <button className={styles.btnSecondary} onClick={() => setEditingFolder(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Script */}
      {editingScript && (
        <div className={styles.modalOverlay} onClick={() => setEditingScript(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editingScript.id ? "Editar Script" : "Novo Script"}</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Título</label>
                <input className={styles.formInput} value={editingScript.title} onChange={e => setEditingScript({ ...editingScript, title: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Pasta</label>
                <select className={styles.formSelect} value={editingScript.folderId} onChange={e => setEditingScript({ ...editingScript, folderId: e.target.value })}>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ícone (emoji)</label>
                <input className={styles.formInput} value={editingScript.icon || ""} onChange={e => setEditingScript({ ...editingScript, icon: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ordem</label>
                <input className={styles.formInput} type="number" value={editingScript.sortOrder || 0} onChange={e => setEditingScript({ ...editingScript, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Conteúdo do Script</label>
                <textarea className={styles.formTextarea} style={{ minHeight: 200 }} value={editingScript.content} onChange={e => setEditingScript({ ...editingScript, content: e.target.value })} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={saveScript}>Salvar Script</button>
              <button className={styles.btnSecondary} onClick={() => setEditingScript(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
