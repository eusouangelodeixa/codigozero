"use client";
/**
 * Gestor de CONTEÚDO de um curso: coluna de módulos (drag para reordenar,
 * capa vertical) + coluna de aulas do módulo selecionado (drag, modal com abas
 * Básico/Conteúdo/Materiais, vídeo R2, thumb, mover de módulo).
 *
 * Compartilhado entre o ADMIN (`/api/admin/members`) e o COPRODUTOR
 * (`/api/coproducer`) — a única diferença é `apiBase`/`uploadPath`. Zero
 * duplicação: o backend também usa um serviço único (courseContent.service).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, useToast } from "@/components/ui";
import { mdToHtml } from "@/lib/md";
import LessonVideoUploader from "@/components/LessonVideoUploader";
import styles from "@/app/admin/admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

type Material = { name: string; url: string; type: string };
type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  description?: string | null;
  videoUrl: string;
  duration?: number | null;
  thumbnailUrl?: string | null;
  content?: string | null;
  materials?: Material[] | null;
  sortOrder: number;
  storageProvider?: string | null;
  videoType?: string | null;
};
type Mod = {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  isFree?: boolean;
  sortOrder: number;
  lessons: Lesson[];
};
type Course = { id: string; name: string; slug: string; status: string; modules: Mod[] };

/** Botão de upload de imagem/PDF que sobe pela pipeline de mídia (webp/PDF). */
function UploadBtn({
  label,
  onDone,
  uploadPath,
  accept = "image/*",
}: {
  label: string;
  onDone: (url: string) => void;
  uploadPath: string;
  accept?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className={styles.btnSecondary} style={{ cursor: "pointer", display: "inline-block" }}>
      {busy ? "Enviando…" : label}
      <input
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const fd = new FormData();
            fd.append("file", file);
            const r = await fetch(`${API}${uploadPath}`, {
              method: "POST",
              headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` },
              body: fd,
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onDone(d.url);
          } catch (err: any) {
            toast.error(err?.message || "Falha no upload");
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </label>
  );
}

export default function CourseContentManager({
  courseId,
  apiBase,
  uploadPath,
}: {
  courseId: string;
  apiBase: string; // "/api/admin/members" | "/api/coproducer"
  uploadPath: string; // rota do POST de mídia
}) {
  const toast = useToast();
  const [course, setCourse] = useState<Course | null>(null);
  const [selModId, setSelModId] = useState<string | null>(null);
  const [dragMod, setDragMod] = useState<number | null>(null);
  const [dragLes, setDragLes] = useState<number | null>(null);

  const [modOpen, setModOpen] = useState(false);
  const [modEdit, setModEdit] = useState<Partial<Mod>>({});
  const [lesOpen, setLesOpen] = useState(false);
  const [lesEdit, setLesEdit] = useState<Partial<Lesson>>({});
  const [lesTab, setLesTab] = useState<"basico" | "conteudo" | "materiais">("basico");

  const api = useCallback(async (path: string, method: string, body?: unknown) => {
    const r = await fetch(`${API}${apiBase}${path}`, { method, headers: hdr(), body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Erro");
    return d;
  }, [apiBase]);

  const load = useCallback(() => {
    fetch(`${API}${apiBase}/courses/${courseId}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (!d.course) throw new Error(d.error);
        setCourse(d.course);
        setSelModId((cur) => cur || d.course.modules[0]?.id || null);
      })
      .catch(() => toast.error("Falha ao carregar curso"));
  }, [apiBase, courseId, toast]);

  useEffect(() => { load(); }, [load]);

  const selMod = useMemo(() => course?.modules.find((m) => m.id === selModId) || null, [course, selModId]);

  // ── Módulos ──
  const saveModule = async () => {
    try {
      if (modEdit.id) await api(`/modules/${modEdit.id}`, "PATCH", modEdit);
      else await api(`/courses/${courseId}/modules`, "POST", modEdit);
      toast.success("Módulo salvo");
      setModOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };
  const deleteModule = async (m: Mod) => {
    if (!confirm(`Excluir o módulo "${m.title}" e todas as suas aulas?`)) return;
    try {
      await api(`/modules/${m.id}`, "DELETE");
      toast.success("Módulo excluído");
      if (selModId === m.id) setSelModId(null);
      load();
    } catch (e: any) { toast.error(e.message); }
  };
  const dropModule = async (to: number) => {
    if (dragMod === null || !course || dragMod === to) return;
    const ids = course.modules.map((m) => m.id);
    const [moved] = ids.splice(dragMod, 1);
    ids.splice(to, 0, moved);
    setCourse({ ...course, modules: ids.map((mid) => course.modules.find((m) => m.id === mid)!) });
    setDragMod(null);
    try { await api(`/courses/${courseId}/modules/reorder`, "POST", { ids }); }
    catch { toast.error("Falha ao reordenar"); load(); }
  };

  // ── Aulas ──
  const saveLesson = async () => {
    try {
      const body = { ...lesEdit, duration: lesEdit.duration ? Number(lesEdit.duration) : null };
      if (lesEdit.id) await api(`/lessons/${lesEdit.id}`, "PATCH", body);
      else await api(`/modules/${selModId}/lessons`, "POST", body);
      toast.success("Aula salva");
      setLesOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  };
  // O upload de vídeo pode começar ANTES do "Salvar": cria a aula na hora e
  // devolve o id pro uploader pendurar o vídeo. O ref deduplica cliques
  // concorrentes (dois uploads/salvar em paralelo não podem criar duas aulas).
  const creatingLessonRef = useRef<Promise<string> | null>(null);
  const ensureLessonSaved = useCallback(async (): Promise<string> => {
    if (lesEdit.id) return lesEdit.id;
    if (creatingLessonRef.current) return creatingLessonRef.current;
    const p = (async () => {
      if (!selModId) throw new Error("Selecione um módulo antes de enviar o vídeo");
      if (!(lesEdit.title || "").trim()) throw new Error("Dê um título à aula antes de enviar o vídeo");
      const body = { ...lesEdit, duration: lesEdit.duration ? Number(lesEdit.duration) : null };
      const d = await api(`/modules/${selModId}/lessons`, "POST", body);
      const id: string = d.lesson.id;
      setLesEdit((l) => ({ ...l, id }));
      toast.success("Aula criada — enviando o vídeo…");
      load();
      return id;
    })();
    creatingLessonRef.current = p;
    try { return await p; }
    finally { creatingLessonRef.current = null; }
  }, [lesEdit, selModId, api, load, toast]);
  const deleteLesson = async (l: Lesson) => {
    if (!confirm(`Excluir a aula "${l.title}"?`)) return;
    try {
      await api(`/lessons/${l.id}`, "DELETE");
      toast.success("Aula excluída");
      load();
    } catch (e: any) { toast.error(e.message); }
  };
  const dropLesson = async (to: number) => {
    if (dragLes === null || !selMod || dragLes === to) return;
    const ids = selMod.lessons.map((l) => l.id);
    const [moved] = ids.splice(dragLes, 1);
    ids.splice(to, 0, moved);
    setDragLes(null);
    setCourse((c) =>
      c
        ? { ...c, modules: c.modules.map((m) => (m.id === selMod.id ? { ...m, lessons: ids.map((lid) => m.lessons.find((l) => l.id === lid)!) } : m)) }
        : c,
    );
    try { await api(`/modules/${selMod.id}/lessons/reorder`, "POST", { ids }); }
    catch { toast.error("Falha ao reordenar"); load(); }
  };

  const mats: Material[] = (lesEdit.materials as Material[]) || [];

  if (!course) return <p style={{ color: "var(--text-tertiary)" }}>Carregando…</p>;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
        {/* Coluna de módulos */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Módulos</span>
            <button type="button" className={styles.btnSecondary} onClick={() => { setModEdit({}); setModOpen(true); }}>
              + Módulo
            </button>
          </div>
          {course.modules.map((m, i) => (
            <div
              key={m.id}
              draggable
              onDragStart={() => setDragMod(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropModule(i)}
              onClick={() => setSelModId(m.id)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 10, cursor: "pointer",
                background: m.id === selModId ? "var(--accent-dim)" : "transparent",
                border: m.id === selModId ? "1px solid var(--accent-border)" : "1px solid transparent",
                marginBottom: 4,
              }}
            >
              <span style={{ cursor: "grab", color: "var(--text-tertiary)" }}>⠿</span>
              {m.coverUrl ? (
                <img src={m.coverUrl} alt="" style={{ width: 34, aspectRatio: "2/3", objectFit: "cover", borderRadius: 5 }} />
              ) : (
                <div style={{ width: 34, aspectRatio: "2/3", borderRadius: 5, background: "var(--bg-elevated)" }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>{m.lessons.length} aulas</div>
              </div>
              <button type="button" className={styles.actionBtn} onClick={(e) => { e.stopPropagation(); setModEdit(m); setModOpen(true); }}>✏️</button>
              <button type="button" className={styles.actionBtnDanger} onClick={(e) => { e.stopPropagation(); deleteModule(m); }}>🗑</button>
            </div>
          ))}
          {course.modules.length === 0 && <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Nenhum módulo ainda.</p>}
        </div>

        {/* Coluna de aulas */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{selMod ? `Aulas — ${selMod.title}` : "Aulas"}</span>
            {selMod && (
              <button type="button" className={styles.btnPrimary} onClick={() => { setLesEdit({ moduleId: selMod.id }); setLesTab("basico"); setLesOpen(true); }}>
                + Aula
              </button>
            )}
          </div>
          {!selMod ? (
            <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Selecione um módulo à esquerda.</p>
          ) : (
            selMod.lessons.map((l, i) => (
              <div
                key={l.id}
                draggable
                onDragStart={() => setDragLes(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropLesson(i)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: "1px solid var(--border-subtle)" }}
              >
                <span style={{ cursor: "grab", color: "var(--text-tertiary)" }}>⠿</span>
                <span style={{ color: "var(--text-tertiary)", fontSize: 12, width: 24 }}>{String(i + 1).padStart(2, "0")}</span>
                {l.thumbnailUrl ? (
                  <img src={l.thumbnailUrl} alt="" style={{ width: 56, aspectRatio: "16/9", objectFit: "cover", borderRadius: 5 }} />
                ) : (
                  <div style={{ width: 56, aspectRatio: "16/9", borderRadius: 5, background: "var(--bg-elevated)" }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                    {l.duration ? `${Math.round(l.duration / 60)} min` : "sem duração"} ·{" "}
                    {l.storageProvider === "r2" ? "vídeo R2 ✓" : l.videoUrl ? "vídeo ok" : "SEM VÍDEO"} · {(l.materials as Material[] | null)?.length || 0} materiais
                  </div>
                </div>
                <button type="button" className={styles.actionBtn} onClick={() => { setLesEdit({ ...l, materials: (l.materials as Material[]) || [] }); setLesTab("basico"); setLesOpen(true); }}>✏️</button>
                <button type="button" className={styles.actionBtnDanger} onClick={() => deleteLesson(l)}>🗑</button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal módulo */}
      <Modal open={modOpen} onClose={() => setModOpen(false)} title={modEdit.id ? "Editar módulo" : "Novo módulo"} size="md">
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Título</label>
          <input className={styles.formInput} value={modEdit.title || ""} onChange={(e) => setModEdit((m) => ({ ...m, title: e.target.value }))} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Descrição</label>
          <textarea className={styles.formTextarea} rows={2} value={modEdit.description || ""} onChange={(e) => setModEdit((m) => ({ ...m, description: e.target.value }))} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Capa vertical (poster 2:3 do carrossel)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {modEdit.coverUrl && <img src={modEdit.coverUrl} alt="" style={{ width: 60, aspectRatio: "2/3", objectFit: "cover", borderRadius: 6 }} />}
            <UploadBtn label={modEdit.coverUrl ? "Trocar capa" : "Enviar capa"} uploadPath={uploadPath} onDone={(url) => setModEdit((m) => ({ ...m, coverUrl: url }))} />
            {modEdit.coverUrl && (
              <button type="button" className={styles.btnSecondary} onClick={() => setModEdit((m) => ({ ...m, coverUrl: null as any }))}>Remover</button>
            )}
          </div>
        </div>
        <div className={styles.formGroup}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={!!modEdit.isFree} onChange={(e) => setModEdit((m) => ({ ...m, isFree: e.target.checked }))} />
            <span>Amostra grátis — abre para quem ainda não comprou</span>
          </label>
          <p className={styles.formHint}>Só faz diferença em curso vendido à parte. Os outros módulos aparecem com cadeado.</p>
        </div>
        <div className={styles.btnRow}>
          <button type="button" className={styles.btnSecondary} onClick={() => setModOpen(false)}>Cancelar</button>
          <button type="button" className={styles.btnPrimary} onClick={saveModule}>Salvar</button>
        </div>
      </Modal>

      {/* Modal aula */}
      <Modal open={lesOpen} onClose={() => setLesOpen(false)} title={lesEdit.id ? "Editar aula" : "Nova aula"} size="lg">
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {([["basico", "Básico"], ["conteudo", "Conteúdo"], ["materiais", "Materiais"]] as const).map(([t, label]) => (
            <button key={t} type="button" className={lesTab === t ? styles.filterBtnActive : styles.filterBtn} onClick={() => setLesTab(t)}>{label}</button>
          ))}
        </div>

        {lesTab === "basico" && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Título</label>
              <input className={styles.formInput} value={lesEdit.title || ""} onChange={(e) => setLesEdit((l) => ({ ...l, title: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Vídeo da Aula</label>
              <LessonVideoUploader
                lessonId={lesEdit.id || null}
                ensureLessonId={ensureLessonSaved}
                apiBase={apiBase}
                uploadPath={uploadPath}
                onDuration={(s) => setLesEdit((l) => (l.duration ? l : { ...l, duration: s }))}
                onThumbnail={(url) => setLesEdit((l) => (l.thumbnailUrl ? l : { ...l, thumbnailUrl: url }))}
              />
              {!lesEdit.id && (
                <p className={styles.formHint}>Ao enviar o vídeo, a aula é criada e salva automaticamente com o título acima.</p>
              )}
            </div>
            <details style={{ marginBottom: 4 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--text-secondary)" }}>Usar embed externo (Kilax/YouTube/Vimeo) — avançado</summary>
              <div className={styles.formGroup} style={{ marginTop: 8 }}>
                <textarea
                  className={styles.formTextarea}
                  rows={3}
                  style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
                  placeholder='<iframe src="https://…" …></iframe>'
                  value={lesEdit.videoUrl || ""}
                  onChange={(e) => setLesEdit((l) => ({ ...l, videoUrl: e.target.value }))}
                />
                <p className={styles.formHint}>Só é usado quando a aula NÃO tem vídeo no R2. O vídeo do R2 sempre tem prioridade.</p>
              </div>
            </details>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Duração (segundos)</label>
                <input
                  className={styles.formInput}
                  type="number"
                  value={lesEdit.duration ?? ""}
                  onChange={(e) => setLesEdit((l) => ({ ...l, duration: e.target.value ? parseInt(e.target.value, 10) : null }))}
                />
              </div>
              {lesEdit.id && course.modules.length > 1 && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Mover para módulo</label>
                  <select className={styles.formSelect} value={lesEdit.moduleId} onChange={(e) => setLesEdit((l) => ({ ...l, moduleId: e.target.value }))}>
                    {course.modules.map((m) => (<option key={m.id} value={m.id}>{m.title}</option>))}
                  </select>
                </div>
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Miniatura (16:9)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {lesEdit.thumbnailUrl && <img src={lesEdit.thumbnailUrl} alt="" style={{ width: 96, aspectRatio: "16/9", objectFit: "cover", borderRadius: 6 }} />}
                <UploadBtn label={lesEdit.thumbnailUrl ? "Trocar" : "Enviar miniatura"} uploadPath={uploadPath} onDone={(url) => setLesEdit((l) => ({ ...l, thumbnailUrl: url }))} />
              </div>
            </div>
          </>
        )}

        {lesTab === "conteudo" && (
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Texto da aula (markdown: **negrito**, - listas, [links](url))</label>
              <textarea className={styles.formTextarea} rows={12} value={lesEdit.content || ""} onChange={(e) => setLesEdit((l) => ({ ...l, content: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Prévia</label>
              <div
                style={{ border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14, minHeight: 120, lineHeight: 1.65, fontSize: 14 }}
                dangerouslySetInnerHTML={{ __html: mdToHtml(lesEdit.content || "") }}
              />
            </div>
          </div>
        )}

        {lesTab === "materiais" && (
          <>
            {mats.map((m, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "110px 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                <select
                  className={styles.formSelect}
                  value={m.type}
                  onChange={(e) => setLesEdit((l) => ({ ...l, materials: mats.map((x, xi) => (xi === i ? { ...x, type: e.target.value } : x)) }))}
                >
                  {["link", "pdf", "tool", "template", "video"].map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
                <input className={styles.formInput} placeholder="Nome" value={m.name} onChange={(e) => setLesEdit((l) => ({ ...l, materials: mats.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)) }))} />
                <input className={styles.formInput} placeholder="URL" value={m.url} onChange={(e) => setLesEdit((l) => ({ ...l, materials: mats.map((x, xi) => (xi === i ? { ...x, url: e.target.value } : x)) }))} />
                <button type="button" className={styles.actionBtnDanger} onClick={() => setLesEdit((l) => ({ ...l, materials: mats.filter((_, xi) => xi !== i) }))}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={styles.btnSecondary} onClick={() => setLesEdit((l) => ({ ...l, materials: [...mats, { name: "", url: "", type: "link" }] }))}>+ Material</button>
              <UploadBtn
                label="Upload de arquivo (PDF/imagem)"
                uploadPath={uploadPath}
                accept="image/*,application/pdf"
                onDone={(url) => setLesEdit((l) => ({ ...l, materials: [...mats, { name: "Arquivo", url, type: "pdf" }] }))}
              />
            </div>
          </>
        )}

        <div className={styles.btnRow} style={{ marginTop: 16 }}>
          <button type="button" className={styles.btnSecondary} onClick={() => setLesOpen(false)}>Cancelar</button>
          <button type="button" className={styles.btnPrimary} onClick={saveLesson}>Salvar aula</button>
        </div>
      </Modal>
    </>
  );
}
