"use client";
// Gestor de conteúdo de um curso: coluna de módulos (drag para reordenar,
// capa vertical) e coluna de aulas do módulo selecionado (drag, modal com
// abas Básico/Conteúdo/Materiais, thumb, mover de módulo). DnD nativo HTML5
// (mesmo padrão do /admin/conteudo).
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { Modal, useToast } from "@/components/ui";
import { mdToHtml } from "@/lib/md";
import styles from "../../admin.module.css";

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
type Course = {
  id: string; name: string; slug: string; status: string; modules: Mod[];
  accessType?: string; productPid?: string | null; webhookToken?: string | null;
};

function UploadBtn({
  label,
  onDone,
  accept = "image/*",
}: {
  label: string;
  onDone: (url: string) => void;
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
            const r = await fetch(`${API}/api/admin/members/upload`, {
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

export default function AdminCursoConteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [selModId, setSelModId] = useState<string | null>(null);
  const [dragMod, setDragMod] = useState<number | null>(null);
  const [dragLes, setDragLes] = useState<number | null>(null);

  // Modais
  const [modOpen, setModOpen] = useState(false);
  const [modEdit, setModEdit] = useState<Partial<Mod>>({});
  const [lesOpen, setLesOpen] = useState(false);
  const [lesEdit, setLesEdit] = useState<Partial<Lesson>>({});
  const [lesTab, setLesTab] = useState<"basico" | "conteudo" | "materiais">("basico");

  const load = useCallback(() => {
    fetch(`${API}/api/admin/members/courses/${id}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (!d.course) throw new Error(d.error);
        setCourse(d.course);
        setSelModId((cur) => cur || d.course.modules[0]?.id || null);
      })
      .catch(() => toast.error("Falha ao carregar curso"));
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const selMod = useMemo(() => course?.modules.find((m) => m.id === selModId) || null, [course, selModId]);

  const api = async (path: string, method: string, body?: unknown) => {
    const r = await fetch(`${API}${path}`, { method, headers: hdr(), body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Erro");
    return d;
  };

  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  // Guarda tipo de acesso / pid. Recarrega para o ecrã reflectir o que ficou.
  const saveAccess = async (patch: Record<string, unknown>) => {
    try {
      await api(`/api/admin/members/courses/${id}`, "PATCH", patch);
      toast.success("Acesso atualizado");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const gerarWebhook = async () => {
    try {
      const d = await api(`/api/admin/members/courses/${id}/webhook-token`, "POST");
      setWebhookUrl(d.webhookUrl);
      toast.success("URL gerada — cole na Lojou");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // ── Módulos ──
  const saveModule = async () => {
    try {
      if (modEdit.id) {
        await api(`/api/admin/members/modules/${modEdit.id}`, "PATCH", modEdit);
      } else {
        await api(`/api/admin/members/courses/${id}/modules`, "POST", modEdit);
      }
      toast.success("Módulo salvo");
      setModOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const deleteModule = async (m: Mod) => {
    if (!confirm(`Excluir o módulo "${m.title}" e todas as suas aulas?`)) return;
    try {
      await api(`/api/admin/members/modules/${m.id}`, "DELETE");
      toast.success("Módulo excluído");
      if (selModId === m.id) setSelModId(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const dropModule = async (to: number) => {
    if (dragMod === null || !course || dragMod === to) return;
    const ids = course.modules.map((m) => m.id);
    const [moved] = ids.splice(dragMod, 1);
    ids.splice(to, 0, moved);
    setCourse({ ...course, modules: ids.map((mid) => course.modules.find((m) => m.id === mid)!) });
    setDragMod(null);
    try {
      await api(`/api/admin/members/courses/${id}/modules/reorder`, "POST", { ids });
    } catch {
      toast.error("Falha ao reordenar");
      load();
    }
  };

  // ── Aulas ──
  const saveLesson = async () => {
    try {
      const body = {
        ...lesEdit,
        duration: lesEdit.duration ? Number(lesEdit.duration) : null,
      };
      if (lesEdit.id) {
        await api(`/api/admin/members/lessons/${lesEdit.id}`, "PATCH", body);
      } else {
        await api(`/api/admin/members/modules/${selModId}/lessons`, "POST", body);
      }
      toast.success("Aula salva");
      setLesOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const deleteLesson = async (l: Lesson) => {
    if (!confirm(`Excluir a aula "${l.title}"?`)) return;
    try {
      await api(`/api/admin/members/lessons/${l.id}`, "DELETE");
      toast.success("Aula excluída");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const dropLesson = async (to: number) => {
    if (dragLes === null || !selMod || dragLes === to) return;
    const ids = selMod.lessons.map((l) => l.id);
    const [moved] = ids.splice(dragLes, 1);
    ids.splice(to, 0, moved);
    setDragLes(null);
    setCourse((c) =>
      c
        ? {
            ...c,
            modules: c.modules.map((m) =>
              m.id === selMod.id ? { ...m, lessons: ids.map((lid) => m.lessons.find((l) => l.id === lid)!) } : m,
            ),
          }
        : c,
    );
    try {
      await api(`/api/admin/members/modules/${selMod.id}/lessons/reorder`, "POST", { ids });
    } catch {
      toast.error("Falha ao reordenar");
      load();
    }
  };

  const mats: Material[] = (lesEdit.materials as Material[]) || [];

  if (!course) return <AdminPage eyebrow="Conteúdo" title="Cursos"><p style={{ color: "var(--text-tertiary)" }}>Carregando…</p></AdminPage>;

  return (
    <AdminPage
      eyebrow="Conteúdo"
      title={course.name}
      desc={`Gestor de conteúdo · members.czero.sbs/${course.slug}`}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push("/admin/cursos")}>
            ← Cursos
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => router.push(`/admin/cursos/${id}/editor`)}>
            Editor visual →
          </button>
        </div>
      }
    >
      {/* ── Acesso e venda ──────────────────────────────────────────────── */}
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Acesso e venda</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Como se ganha acesso</label>
            <select
              className={styles.formInput}
              value={course.accessType || "subscription"}
              onChange={(e) => saveAccess({ accessType: e.target.value })}
            >
              <option value="subscription">Incluído na assinatura</option>
              <option value="paid">Vendido à parte (precisa comprar)</option>
            </select>
            <p className={styles.formHint}>
              Quem recebeu acesso vitalício continua a entrar em qualquer um dos casos.
            </p>
          </div>

          {(course.accessType || "subscription") === "paid" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>PID do produto na Lojou</label>
              <input
                className={styles.formInput}
                defaultValue={course.productPid || ""}
                placeholder="uoEHz"
                onBlur={(e) => saveAccess({ productPid: e.target.value.trim() })}
              />
              <p className={styles.formHint}>
                Confere se a venda recebida é mesmo deste curso. Sem ele, o webhook de outro produto libertaria este.
              </p>
            </div>
          )}
        </div>

        {(course.accessType || "subscription") === "paid" && (
          <div className={styles.formGroup} style={{ marginTop: 4 }}>
            <label className={styles.formLabel}>URL do webhook deste curso</label>
            {webhookUrl ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code
                  style={{
                    flex: 1, minWidth: 260, padding: "10px 12px", borderRadius: 8,
                    background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                    fontSize: 12, wordBreak: "break-all",
                  }}
                >
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    void navigator.clipboard.writeText(webhookUrl);
                    toast.success("Copiado");
                  }}
                >
                  Copiar
                </button>
              </div>
            ) : (
              <button type="button" className={styles.btnSecondary} onClick={gerarWebhook}>
                Gerar URL do webhook
              </button>
            )}
            <p className={styles.formHint}>
              Cole na Lojou, no produto deste curso. É uma rota EXCLUSIVA dele — o webhook principal do Código Zero não
              confere produto nenhum e daria a plataforma inteira a quem comprasse só o curso. Gerar de novo invalida a
              anterior.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 18, alignItems: "start" }}>
        {/* Coluna de módulos */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>Módulos</span>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setModEdit({});
                setModOpen(true);
              }}
            >
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
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 10px",
                borderRadius: 10,
                cursor: "pointer",
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
              <button
                type="button"
                className={styles.actionBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  setModEdit(m);
                  setModOpen(true);
                }}
              >
                ✏️
              </button>
              <button
                type="button"
                className={styles.actionBtnDanger}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteModule(m);
                }}
              >
                🗑
              </button>
            </div>
          ))}
          {course.modules.length === 0 && <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Nenhum módulo ainda.</p>}
        </div>

        {/* Coluna de aulas */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{selMod ? `Aulas — ${selMod.title}` : "Aulas"}</span>
            {selMod && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setLesEdit({ moduleId: selMod.id });
                  setLesTab("basico");
                  setLesOpen(true);
                }}
              >
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
                    {l.videoUrl ? "vídeo ok" : "SEM VÍDEO"} · {(l.materials as Material[] | null)?.length || 0} materiais
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => {
                    setLesEdit({ ...l, materials: (l.materials as Material[]) || [] });
                    setLesTab("basico");
                    setLesOpen(true);
                  }}
                >
                  ✏️
                </button>
                <button type="button" className={styles.actionBtnDanger} onClick={() => deleteLesson(l)}>
                  🗑
                </button>
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
            <UploadBtn label={modEdit.coverUrl ? "Trocar capa" : "Enviar capa"} onDone={(url) => setModEdit((m) => ({ ...m, coverUrl: url }))} />
            {modEdit.coverUrl && (
              <button type="button" className={styles.btnSecondary} onClick={() => setModEdit((m) => ({ ...m, coverUrl: null as any }))}>
                Remover
              </button>
            )}
          </div>
        </div>
        <div className={styles.formGroup}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!modEdit.isFree}
              onChange={(e) => setModEdit((m) => ({ ...m, isFree: e.target.checked }))}
            />
            <span>Amostra grátis — abre para quem ainda não comprou</span>
          </label>
          <p className={styles.formHint}>
            Só faz diferença em curso vendido à parte. Os outros módulos aparecem com cadeado.
          </p>
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
            <button key={t} type="button" className={lesTab === t ? styles.filterBtnActive : styles.filterBtn} onClick={() => setLesTab(t)}>
              {label}
            </button>
          ))}
        </div>

        {lesTab === "basico" && (
          <>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Título</label>
              <input className={styles.formInput} value={lesEdit.title || ""} onChange={(e) => setLesEdit((l) => ({ ...l, title: e.target.value }))} />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Vídeo (embed completo ou URL — Kilax/YouTube/Vimeo)</label>
              <textarea
                className={styles.formTextarea}
                rows={3}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
                placeholder='<iframe src="https://…" …></iframe>'
                value={lesEdit.videoUrl || ""}
                onChange={(e) => setLesEdit((l) => ({ ...l, videoUrl: e.target.value }))}
              />
            </div>
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
                  <select
                    className={styles.formSelect}
                    value={lesEdit.moduleId}
                    onChange={(e) => setLesEdit((l) => ({ ...l, moduleId: e.target.value }))}
                  >
                    {course.modules.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Miniatura (16:9)</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {lesEdit.thumbnailUrl && <img src={lesEdit.thumbnailUrl} alt="" style={{ width: 96, aspectRatio: "16/9", objectFit: "cover", borderRadius: 6 }} />}
                <UploadBtn label={lesEdit.thumbnailUrl ? "Trocar" : "Enviar miniatura"} onDone={(url) => setLesEdit((l) => ({ ...l, thumbnailUrl: url }))} />
              </div>
            </div>
          </>
        )}

        {lesTab === "conteudo" && (
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Texto da aula (markdown: **negrito**, - listas, [links](url))</label>
              <textarea
                className={styles.formTextarea}
                rows={12}
                value={lesEdit.content || ""}
                onChange={(e) => setLesEdit((l) => ({ ...l, content: e.target.value }))}
              />
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
                  {["link", "pdf", "tool", "template", "video"].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input className={styles.formInput} placeholder="Nome" value={m.name} onChange={(e) => setLesEdit((l) => ({ ...l, materials: mats.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)) }))} />
                <input className={styles.formInput} placeholder="URL" value={m.url} onChange={(e) => setLesEdit((l) => ({ ...l, materials: mats.map((x, xi) => (xi === i ? { ...x, url: e.target.value } : x)) }))} />
                <button type="button" className={styles.actionBtnDanger} onClick={() => setLesEdit((l) => ({ ...l, materials: mats.filter((_, xi) => xi !== i) }))}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className={styles.btnSecondary} onClick={() => setLesEdit((l) => ({ ...l, materials: [...mats, { name: "", url: "", type: "link" }] }))}>
                + Material
              </button>
              <UploadBtn
                label="Upload de arquivo (PDF/imagem)"
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
    </AdminPage>
  );
}
