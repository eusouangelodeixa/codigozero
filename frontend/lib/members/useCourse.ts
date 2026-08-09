"use client";
// Hook compartilhado pelas páginas do curso (home, conteúdo, player): carrega
// o payload do curso, aplica config (título/favicon), e expõe helpers de
// progresso com atualização otimista.
import { useCallback, useEffect, useState } from "react";
import { membersFetch, requireMembersAuth } from "@/lib/members/api";
import { mergeMemberConfig, type MemberConfig } from "@/lib/members/defaults";
import type { ContinueItem, MemberModule } from "@/components/members/widgets";

export type CoursePayload = {
  course: { id: string; slug: string; name: string; config: unknown; locked?: boolean; accessType?: string };
  modules: MemberModule[];
  continue: ContinueItem;
};

export function useCourse(slug: string) {
  const [data, setData] = useState<CoursePayload | null>(null);
  const [config, setConfig] = useState<MemberConfig | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    membersFetch<CoursePayload>(`/api/members/courses/${encodeURIComponent(slug)}`)
      .then((d) => {
        setData(d);
        const cfg = mergeMemberConfig(d.course.config);
        setConfig(cfg);
        document.title = `${d.course.name} — Área de Membros`;
        if (cfg.branding.faviconUrl) {
          let link = document.querySelector<HTMLLinkElement>("link[rel='icon'][data-members]");
          if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            link.setAttribute("data-members", "1");
            document.head.appendChild(link);
          }
          link.href = cfg.branding.faviconUrl;
        }
      })
      .catch((e) => setError(e?.message || "Erro ao carregar curso"));
  }, [slug]);

  useEffect(() => {
    if (!requireMembersAuth()) return;
    load();
  }, [load]);

  /** Marca/desmarca conclusão com atualização otimista das listas. */
  const toggleComplete = useCallback(
    (lessonId: string, completed: boolean) => {
      setData((d) => {
        if (!d) return d;
        const modules = d.modules.map((m) => {
          const lessons = m.lessons.map((l) => (l.id === lessonId ? { ...l, completed } : l));
          return {
            ...m,
            lessons,
            completedLessons: lessons.filter((l) => l.completed).length,
          };
        });
        return { ...d, modules };
      });
      membersFetch("/api/members/progress", {
        method: "POST",
        body: JSON.stringify({ lessonId, completed }),
      }).catch(() => load()); // falhou → recarrega o estado real
    },
    [load],
  );

  return { data, config, error, reload: load, toggleComplete };
}
