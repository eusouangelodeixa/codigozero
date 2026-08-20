"use client";
// Player da aula: embed de vídeo (Kilax/YouTube/Vimeo — mesmo patch de
// fullscreen da Forja), estrelas, anterior/próxima, marcar concluída, abas
// Aulas|Conteúdo (mobile) e drawer de módulos (desktop). Registra
// visualização ao abrir ({viewed:true} → continuar assistindo).
import { use, useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import k from "@/components/members/kit.module.css";
import { ThemeVars } from "@/components/members/ThemeVars";
import { LessonDrawer, MaterialList, StarRating, fmtDur } from "@/components/members/widgets";
import { useCourse } from "@/lib/members/useCourse";
import { membersFetch, absMediaUrl } from "@/lib/members/api";
import { memberGo } from "@/lib/members/nav";
import MembersVideoPlayer from "@/components/members/VideoPlayer";
import { mdToHtml } from "@/lib/md";

type LessonPayload = {
  lesson: {
    id: string;
    moduleId: string;
    courseSlug: string;
    title: string;
    description?: string | null;
    videoUrl: string;
    storageProvider?: string | null; // 'embed' | 'r2'
    videoType?: string | null;
    thumbnailUrl?: string | null;
    duration?: number | null;
    content?: string | null;
    materials?: { name: string; url: string; type?: string }[] | null;
  };
  completed: boolean;
  rating: number | null;
  prevLessonId: string | null;
  nextLessonId: string | null;
};

export default function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = use(params);
  const { data: course, config, toggleComplete } = useCourse(slug);
  const [payload, setPayload] = useState<LessonPayload | null>(null);
  const [tab, setTab] = useState<"aulas" | "conteudo">("conteudo");
  const [err, setErr] = useState("");

  useEffect(() => {
    setPayload(null);
    membersFetch<LessonPayload>(`/api/members/lessons/${encodeURIComponent(lessonId)}`)
      .then((d) => {
        setPayload(d);
        // Registra a visualização (alimenta o "Continuar assistindo").
        membersFetch("/api/members/progress", {
          method: "POST",
          body: JSON.stringify({ lessonId, viewed: true }),
        }).catch(() => {});
      })
      .catch((e) => setErr(e?.message || "Erro ao carregar aula"));
  }, [lessonId]);

  // O backend recusa a aula de módulo fechado (403) — sem isto o aluno via só
  // "Erro ao carregar aula" e não entendia que era bloqueio, não avaria.
  if (err) {
    const bloqueada = /bloquead/i.test(err);
    return (
      <div className={k.centerLoad} style={{ minHeight: "100dvh", flexDirection: "column", gap: 14, textAlign: "center", padding: 24 }}>
        {bloqueada ? (
          <>
            <Lock size={26} />
            <div style={{ maxWidth: 420, lineHeight: 1.6 }}>
              <strong>Esta aula faz parte do conteúdo pago.</strong>
              <br />
              As aulas de amostra continuam abertas — o resto liberta depois da compra.
            </div>
            {course?.course.checkoutUrl && (
              // Mesma aba de propósito (navegador embutido ignora _blank).
              <a
                href={course.course.checkoutUrl}
                style={{
                  padding: "11px 22px",
                  borderRadius: 10,
                  background: "var(--accent, #2DD4BF)",
                  color: "#001412",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                }}
              >
                Comprar o curso →
              </a>
            )}
            <button type="button" className={k.courseBtn} onClick={() => memberGo(`/${slug}`)}>
              Voltar ao curso
            </button>
          </>
        ) : (
          err
        )}
      </div>
    );
  }
  if (!payload || !config || !course) {
    return <div className={k.centerLoad} style={{ minHeight: "100dvh" }}>Carregando aula…</div>;
  }

  const { lesson } = payload;
  const isEmbed = (lesson.videoUrl || "").includes("<iframe");
  // Mesmo patch de fullscreen usado na Forja antiga.
  const embedHtml = isEmbed
    ? lesson.videoUrl.replace(
        "<iframe ",
        '<iframe allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" ',
      )
    : lesson.videoUrl
      ? `<iframe src="${lesson.videoUrl.replace(/"/g, "&quot;")}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen="true"></iframe>`
      : "";

  const completed = course.modules.flatMap((m) => m.lessons).find((l) => l.id === lesson.id)?.completed ?? payload.completed;

  const setRating = (stars: number) => {
    setPayload((p) => (p ? { ...p, rating: stars } : p));
    membersFetch("/api/members/progress", {
      method: "POST",
      body: JSON.stringify({ lessonId: lesson.id, rating: stars }),
    }).catch(() => {});
  };

  const goLesson = (id: string | null) => id && memberGo(`/${slug}/aula/${id}`);

  const drawer = (
    <LessonDrawer
      modules={course.modules}
      currentLessonId={lesson.id}
      onOpen={(id) => goLesson(id)}
      onToggleComplete={toggleComplete}
    />
  );

  return (
    <ThemeVars config={config}>
      <div className={k.playerLayout}>
        <div className={k.playerMain}>
          <div className={k.playerTop}>
            <button type="button" className={k.backBtn} onClick={() => memberGo(`/${slug}`)} aria-label="Voltar">
              <ArrowLeft size={20} />
            </button>
            <strong style={{ fontSize: 14, color: "var(--m-text-dim)" }}>{course.course.name}</strong>
          </div>

          <div className={k.videoFrame} style={{ marginTop: 12 }}>
            <MembersVideoPlayer
              lessonId={lesson.id}
              storageProvider={lesson.storageProvider}
              embedHtml={embedHtml}
              poster={lesson.thumbnailUrl ? absMediaUrl(lesson.thumbnailUrl) : undefined}
            />
          </div>

          <div className={k.playerInfo}>
            <div className={k.playerTitleRow}>
              <h1 className={k.playerTitle}>{lesson.title}</h1>
              <StarRating value={payload.rating} onChange={setRating} />
              <div className={k.navArrows}>
                <a
                  className={k.navArrow}
                  aria-disabled={!payload.prevLessonId}
                  onClick={(e) => { e.preventDefault(); goLesson(payload.prevLessonId); }}
                  href="#"
                  aria-label="Aula anterior"
                >
                  <ChevronLeft size={18} />
                </a>
                <a
                  className={k.navArrow}
                  aria-disabled={!payload.nextLessonId}
                  onClick={(e) => { e.preventDefault(); goLesson(payload.nextLessonId); }}
                  href="#"
                  aria-label="Próxima aula"
                >
                  <ChevronRight size={18} />
                </a>
              </div>
            </div>
            {lesson.duration ? <span style={{ color: "var(--m-text-dim)", fontSize: 13 }}>{fmtDur(lesson.duration)}</span> : null}

            <button
              type="button"
              className={`${k.completeBtn} ${completed ? k.completeBtnDone : ""}`}
              onClick={() => toggleComplete(lesson.id, !completed)}
            >
              <Check size={15} strokeWidth={3} /> {completed ? "Concluída" : "Marcar como concluída"}
            </button>

            {/* Abas no mobile; no desktop o drawer fica na coluna direita */}
            <div className={k.tabs} data-mobile-tabs>
              <button type="button" className={`${k.tab} ${tab === "conteudo" ? k.tabActive : ""}`} onClick={() => setTab("conteudo")}>
                Conteúdo
              </button>
              <button
                type="button"
                className={`${k.tab} ${k.tabAulasMobile} ${tab === "aulas" ? k.tabActive : ""}`}
                onClick={() => setTab("aulas")}
              >
                Aulas
              </button>
            </div>

            {tab === "conteudo" && (
              <>
                {lesson.description && <p style={{ color: "var(--m-text-dim)", marginTop: 14 }}>{lesson.description}</p>}
                {lesson.content && (
                  <div className={k.playerContent} dangerouslySetInnerHTML={{ __html: mdToHtml(lesson.content) }} />
                )}
                <MaterialList materials={(lesson.materials as any) || []} />
              </>
            )}
            {tab === "aulas" && <div style={{ marginTop: 8 }}>{drawer}</div>}
          </div>
        </div>

        <aside className={k.drawerPanel}>
          <div className={k.drawerHead}>Aulas</div>
          {drawer}
        </aside>
      </div>
    </ThemeVars>
  );
}
