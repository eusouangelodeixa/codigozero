"use client";
// /admin/cursos — lista de cursos da área de membros: criar, publicar,
// acessar o gestor de conteúdo e o editor visual.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AdminPage,
  DataTable,
  StatusBadge,
  RowActions,
  type Column,
  type RowAction,
} from "@/components/admin";
import { Modal, useToast } from "@/components/ui";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

type CourseRow = {
  id: string;
  slug: string;
  name: string;
  coverUrl?: string | null;
  status: string;
  sortOrder: number;
  moduleCount: number;
  lessonCount: number;
  updatedAt: string;
};

export default function AdminCursos() {
  const toast = useToast();
  const router = useRouter();
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CourseRow | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin/members/courses`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => setCourses(d.courses || []))
      .catch(() => toast.error("Falha ao carregar cursos"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/admin/members/courses`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ name: newName.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      toast.success("Curso criado");
      setCreateOpen(false);
      setNewName("");
      router.push(`/admin/cursos/${d.course.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar curso");
    } finally {
      setCreating(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, okMsg: string) => {
    try {
      const r = await fetch(`${API}/api/admin/members/courses/${id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      toast.success(okMsg);
      load();
    } catch {
      toast.error("Falha ao salvar");
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      const r = await fetch(`${API}/api/admin/members/courses/${confirmDelete.id}`, {
        method: "DELETE",
        headers: hdr(),
      });
      if (!r.ok) throw new Error();
      toast.success("Curso excluído");
      setConfirmDelete(null);
      load();
    } catch {
      toast.error("Falha ao excluir");
    }
  };

  const columns: Column<CourseRow>[] = [
    {
      key: "name",
      header: "Curso",
      primaryOnMobile: true,
      render: (c) => (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {c.coverUrl ? (
            <img src={c.coverUrl} alt="" style={{ width: 64, aspectRatio: "16/9", objectFit: "cover", borderRadius: 6 }} />
          ) : (
            <div style={{ width: 64, aspectRatio: "16/9", borderRadius: 6, background: "var(--accent-dim)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700 }}>
              {c.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontWeight: 600 }}>{c.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>members.czero.sbs/{c.slug}</div>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <StatusBadge tone={c.status === "published" ? "good" : "neutral"}>
          {c.status === "published" ? "Publicado" : "Rascunho"}
        </StatusBadge>
      ),
    },
    { key: "conteudo", header: "Conteúdo", render: (c) => `${c.moduleCount} módulos · ${c.lessonCount} aulas`, muted: true },
    {
      key: "updatedAt",
      header: "Atualizado",
      hideOnMobile: true,
      render: (c) => new Date(c.updatedAt).toLocaleDateString("pt-MZ"),
      muted: true,
    },
  ];

  const actions = (c: CourseRow): RowAction[] => [
    { label: "Gerenciar conteúdo", onClick: () => router.push(`/admin/cursos/${c.id}`) },
    { label: "Editor visual", onClick: () => router.push(`/admin/cursos/${c.id}/editor`) },
    {
      label: c.status === "published" ? "Despublicar" : "Publicar",
      onClick: () => patch(c.id, { status: c.status === "published" ? "draft" : "published" }, c.status === "published" ? "Curso despublicado" : "Curso publicado"),
    },
    { label: "Excluir", danger: true, onClick: () => setConfirmDelete(c) },
  ];

  return (
    <AdminPage
      eyebrow="Conteúdo"
      title="Cursos"
      desc="Área de membros multi-curso (members.czero.sbs). Cada curso tem conteúdo e visual próprios."
      actions={
        <button type="button" className={styles.btnPrimary} onClick={() => setCreateOpen(true)}>
          + Novo curso
        </button>
      }
    >
      <DataTable<CourseRow>
        columns={columns}
        rows={courses}
        getRowKey={(c) => c.id}
        loading={loading}
        empty={{ title: "Nenhum curso", desc: "Crie o primeiro curso da área de membros." }}
        onRowClick={(c) => router.push(`/admin/cursos/${c.id}`)}
        rowActions={(c) => <RowActions items={actions(c)} />}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Novo curso" size="sm">
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Nome do curso</label>
          <input
            className={styles.formInput}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex.: Mentoria Código Zero"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
        </div>
        <div className={styles.btnRow}>
          <button type="button" className={styles.btnSecondary} onClick={() => setCreateOpen(false)}>
            Cancelar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={create} disabled={creating}>
            {creating ? "Criando…" : "Criar curso"}
          </button>
        </div>
      </Modal>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Excluir curso" size="sm">
        <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Excluir <strong>{confirmDelete?.name}</strong>? Todos os módulos, aulas e o progresso dos alunos neste
          curso serão apagados. Essa ação não tem volta.
        </p>
        <div className={styles.btnRow}>
          <button type="button" className={styles.btnSecondary} onClick={() => setConfirmDelete(null)}>
            Cancelar
          </button>
          <button type="button" className={styles.btnDanger} onClick={doDelete}>
            Excluir de vez
          </button>
        </div>
      </Modal>
    </AdminPage>
  );
}
