"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminAulas() {
  const [modules, setModules] = useState<any[]>([]);
  const [editMod, setEditMod] = useState<any>(null);
  const [editLesson, setEditLesson] = useState<any>(null);
  const [toast, setToast] = useState("");

  const load = () => {
    fetch(`${API}/api/admin/modules`, { headers: hdr() })
      .then(r => r.json()).then(d => setModules(d.modules || []));
  };
  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  // ── Module CRUD ──
  const saveMod = async () => {
    const method = editMod.id ? "PATCH" : "POST";
    const url = editMod.id ? `${API}/api/admin/modules/${editMod.id}` : `${API}/api/admin/modules`;
    await fetch(url, { method, headers: hdr(), body: JSON.stringify(editMod) });
    showToast(editMod.id ? "Módulo atualizado ✓" : "Módulo criado ✓");
    setEditMod(null); load();
  };
  const deleteMod = async (id: string, title: string) => {
    if (!confirm(`Remover módulo "${title}" e todas suas aulas?`)) return;
    await fetch(`${API}/api/admin/modules/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Módulo removido ✓"); load();
  };

  // ── Lesson CRUD ──
  const saveLesson = async () => {
    const method = editLesson.id ? "PATCH" : "POST";
    const url = editLesson.id ? `${API}/api/admin/lessons/${editLesson.id}` : `${API}/api/admin/lessons`;
    await fetch(url, { method, headers: hdr(), body: JSON.stringify(editLesson) });
    showToast(editLesson.id ? "Aula atualizada ✓" : "Aula criada ✓");
    setEditLesson(null); load();
  };
  const deleteLesson = async (id: string, title: string) => {
    if (!confirm(`Remover aula "${title}"?`)) return;
    await fetch(`${API}/api/admin/lessons/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Aula removida ✓"); load();
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Gestão de Aulas</h1>
        <p className={styles.pageDesc}>{modules.length} módulos · {modules.reduce((s, m) => s + (m.lessons?.length || 0), 0)} aulas</p>
      </div>

      <div className={styles.btnRow} style={{ marginBottom: 24 }}>
        <button className={styles.btnPrimary} onClick={() => setEditMod({ title: "", description: "", icon: "📚", sortOrder: modules.length })}>
          + Novo Módulo
        </button>
      </div>

      {modules.map(mod => (
        <div key={mod.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>{mod.icon || "📚"} {mod.title}</h3>
              {mod.description && <p className={styles.cardDesc}>{mod.description}</p>}
            </div>
            <div className={styles.actions}>
              <button className={styles.actionBtn} onClick={() => setEditMod({ ...mod })}>Editar</button>
              <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => deleteMod(mod.id, mod.title)}>Remover</button>
              <button className={styles.btnPrimary} style={{ padding: "4px 12px", fontSize: 11 }}
                onClick={() => setEditLesson({ moduleId: mod.id, title: "", description: "", videoUrl: "", duration: 0, sortOrder: (mod.lessons?.length || 0) })}>
                + Aula
              </button>
            </div>
          </div>

          {mod.lessons?.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr><th>#</th><th>Título</th><th>Duração</th><th>Video URL</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {mod.lessons.map((lesson: any, i: number) => (
                  <tr key={lesson.id}>
                    <td>{i + 1}</td>
                    <td>{lesson.title}</td>
                    <td>{lesson.duration ? `${Math.floor(lesson.duration / 60)}min` : "—"}</td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lesson.videoUrl || "—"}</td>
                    <td>
                      <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={() => setEditLesson({ ...lesson })}>Editar</button>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => deleteLesson(lesson.id, lesson.title)}>Remover</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}

      {/* Module Modal */}
      {editMod && (
        <div className={styles.modalOverlay} onClick={() => setEditMod(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editMod.id ? "Editar Módulo" : "Novo Módulo"}</h2>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Título</label>
                <input className={styles.formInput} value={editMod.title} onChange={e => setEditMod({ ...editMod, title: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ícone (emoji)</label>
                <input className={styles.formInput} value={editMod.icon || ""} onChange={e => setEditMod({ ...editMod, icon: e.target.value })} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Descrição</label>
                <textarea className={styles.formTextarea} value={editMod.description || ""} onChange={e => setEditMod({ ...editMod, description: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ordem</label>
                <input className={styles.formInput} type="number" value={editMod.sortOrder} onChange={e => setEditMod({ ...editMod, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={saveMod}>Salvar</button>
              <button className={styles.btnSecondary} onClick={() => setEditMod(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lesson Modal */}
      {editLesson && (
        <div className={styles.modalOverlay} onClick={() => setEditLesson(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{editLesson.id ? "Editar Aula" : "Nova Aula"}</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Título</label>
                <input className={styles.formInput} value={editLesson.title} onChange={e => setEditLesson({ ...editLesson, title: e.target.value })} />
              </div>
              <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                <label className={styles.formLabel}>Descrição</label>
                <textarea className={styles.formTextarea} value={editLesson.description || ""} onChange={e => setEditLesson({ ...editLesson, description: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>URL do Vídeo</label>
                <input className={styles.formInput} placeholder="https://..." value={editLesson.videoUrl} onChange={e => setEditLesson({ ...editLesson, videoUrl: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Duração (segundos)</label>
                <input className={styles.formInput} type="number" value={editLesson.duration || 0} onChange={e => setEditLesson({ ...editLesson, duration: parseInt(e.target.value) || 0 })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Ordem</label>
                <input className={styles.formInput} type="number" value={editLesson.sortOrder} onChange={e => setEditLesson({ ...editLesson, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={saveLesson}>Salvar</button>
              <button className={styles.btnSecondary} onClick={() => setEditLesson(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
