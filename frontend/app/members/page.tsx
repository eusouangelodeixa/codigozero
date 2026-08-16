"use client";
// "Meus Cursos" — grade de cursos do assinante (primeira tela após o login
// na área de membros), com busca e filtro de progresso.
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import k from "@/components/members/kit.module.css";
import { CourseCard } from "@/components/members/widgets";
import { absMediaUrl, membersFetch, membersUser, requireMembersAuth, openAppInNewTab } from "@/lib/members/api";
import { memberHref } from "@/lib/members/nav";

type CourseRow = {
  locked?: boolean;
  id: string;
  slug: string;
  name: string;
  coverUrl?: string | null;
  totalLessons: number;
  completedLessons: number;
  pct: number;
};

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "progress", label: "Em andamento" },
  { id: "done", label: "Concluídos" },
] as const;

export default function MembersHome() {
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const user = membersUser();

  useEffect(() => {
    if (!requireMembersAuth()) return;
    membersFetch<{ courses: CourseRow[] }>("/api/members/courses")
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
  }, []);

  const shown = useMemo(() => {
    let list = courses || [];
    if (q.trim()) list = list.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
    if (filter === "progress") list = list.filter((c) => c.pct > 0 && c.pct < 100);
    if (filter === "done") list = list.filter((c) => c.pct >= 100 && c.totalLessons > 0);
    return list;
  }, [courses, q, filter]);

  return (
    <div className={k.gridPage} style={{ ["--accent" as any]: "#2DD4BF", ["--accent-fg" as any]: "#001412", ["--accent-dim" as any]: "rgba(45,212,191,.15)", ["--m-bg" as any]: "#0a0a0a", ["--m-surface" as any]: "#161616", ["--m-text" as any]: "#f4f4f5", ["--m-text-dim" as any]: "#9ca3af" }}>
      <header className={k.gridHeader}>
        <Logo size={30} />
        {/* Perfil: abre a página /perfil do app numa nova aba, já logado. */}
        <button
          type="button"
          className={k.avatar}
          title="Meu perfil"
          onClick={() => openAppInNewTab("/perfil")}
          style={{ cursor: "pointer", border: "none" }}
        >
          {user?.avatarUrl ? <img src={absMediaUrl(user.avatarUrl)} alt="" /> : (user?.name || "A").slice(0, 1).toUpperCase()}
        </button>
      </header>

      <h1 className={k.gridTitle}>Meus Cursos</h1>
      <div className={k.gridControls}>
        <input
          className={k.gridSearch}
          placeholder="Buscar…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          className={k.gridSearch}
          style={{ flex: "0 0 auto", minWidth: 160 }}
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
        >
          {FILTERS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {courses === null ? (
        <div className={k.centerLoad}>Carregando seus cursos…</div>
      ) : shown.length === 0 ? (
        <div className={k.centerLoad}>{q || filter !== "all" ? "Nenhum curso encontrado." : "Nenhum curso disponível ainda."}</div>
      ) : (
        <div className={k.grid}>
          {shown.map((c) => (
            // Curso abre em NOVA ABA (mesma origem members).
            <CourseCard key={c.id} course={c} onOpen={(slug) => window.open(memberHref(`/${slug}`), "_blank")} />
          ))}
        </div>
      )}
    </div>
  );
}
