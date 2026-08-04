"use client";
// Widgets de conteúdo da área de membros — todos puros/props-driven (zero
// fetch): as páginas do aluno E o preview do editor os alimentam.
import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronUp, Play, FileText, Link as LinkIcon, Download, Star } from "lucide-react";
import k from "./kit.module.css";
import type { MemberBannerSlide } from "@/lib/members/defaults";

// ── Tipos dos payloads (espelham /api/members) ─────────────────────────────
export type MemberLesson = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
  completed: boolean;
  rating?: number | null;
};
export type MemberModule = {
  id: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  totalLessons: number;
  completedLessons: number;
  lessons: MemberLesson[];
};
export type ContinueItem = { lessonId: string; title: string; thumbnailUrl?: string | null } | null;

export const fmtDur = (s?: number | null) => (s ? `${Math.max(1, Math.round(s / 60))} min` : "");

// ── Barra de progresso ─────────────────────────────────────────────────────
export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className={k.pbar}>
      <div className={k.pbarFill} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// ── Banner (1–3 slides, auto-avança) ───────────────────────────────────────
export function BannerCarousel({ slides, previewMode }: { slides: MemberBannerSlide[]; previewMode?: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);
  if (!slides.length) return null;
  return (
    <div className={k.banner}>
      {slides.map((s, i) => {
        const img = <img src={s.imageUrl} alt="" />;
        return (
          <div key={s.id || i} className={`${k.bannerSlide} ${i === idx % slides.length ? k.bannerSlideActive : ""}`}>
            {s.linkUrl && !previewMode ? (
              <a href={s.linkUrl} target="_blank" rel="noopener noreferrer">{img}</a>
            ) : (
              img
            )}
          </div>
        );
      })}
      {slides.length > 1 && (
        <div className={k.bannerDots}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`${k.bannerDot} ${i === idx % slides.length ? k.bannerDotActive : ""}`}
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Carrossel de módulos (posters verticais + barra de progresso) ──────────
export function ModuleCarousel({
  title,
  modules,
  onOpenModule,
  previewMode,
}: {
  title?: string;
  modules: MemberModule[];
  onOpenModule?: (moduleId: string) => void;
  previewMode?: boolean;
}) {
  if (!modules.length) return null;
  return (
    <section className={k.section}>
      {title && <h2 className={k.sectionTitle}>{title}</h2>}
      <div className={k.carousel}>
        {modules.map((m) => {
          const pct = m.totalLessons ? Math.round((m.completedLessons / m.totalLessons) * 100) : 0;
          return (
            <button
              key={m.id}
              type="button"
              className={k.posterCard}
              onClick={() => !previewMode && onOpenModule?.(m.id)}
              title={m.title}
            >
              {m.coverUrl ? (
                <img className={k.posterImg} src={m.coverUrl} alt={m.title} />
              ) : (
                <div className={k.posterFallback}>{m.title}</div>
              )}
              <div className={k.posterBar}>
                <div className={k.posterBarFill} style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ── Continuar assistindo (card vertical: thumb 16:9 + legenda) ─────────────
export function ContinueRow({
  title = "Continuar assistindo",
  item,
  onOpen,
  previewMode,
}: {
  title?: string;
  item: ContinueItem;
  onOpen?: (lessonId: string) => void;
  previewMode?: boolean;
}) {
  if (!item) return null;
  return (
    <section className={k.section}>
      <h2 className={k.sectionTitle}>{title}</h2>
      <div
        className={k.continueCard}
        role="button"
        tabIndex={0}
        onClick={() => !previewMode && onOpen?.(item.lessonId)}
        onKeyDown={(e) => e.key === "Enter" && !previewMode && onOpen?.(item.lessonId)}
      >
        <div className={k.continueThumbWrap}>
          {item.thumbnailUrl ? (
            <img className={k.continueThumb} src={item.thumbnailUrl} alt="" />
          ) : (
            <div className={k.continueThumb} style={{ display: "grid", placeItems: "center", color: "var(--m-text-dim)", fontSize: 13, fontWeight: 700, padding: 12, textAlign: "center" }}>
              {item.title}
            </div>
          )}
          <div className={k.continueBar}>
            <div className={k.continueBarFill} />
          </div>
        </div>
        <div className={k.continueTitle}>{item.title}</div>
      </div>
    </section>
  );
}

// ── Lista de aulas de um módulo (página do curso) ──────────────────────────
export function LessonList({
  lessons,
  activeLessonId,
  numberOffset = 0,
  onOpen,
  onToggleComplete,
  previewMode,
}: {
  lessons: MemberLesson[];
  activeLessonId?: string;
  numberOffset?: number;
  onOpen?: (lessonId: string) => void;
  onToggleComplete?: (lessonId: string, completed: boolean) => void;
  previewMode?: boolean;
}) {
  return (
    <div>
      {lessons.map((l, i) => (
        <div
          key={l.id}
          className={`${k.lessonRow} ${l.id === activeLessonId ? k.lessonRowActive : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => !previewMode && onOpen?.(l.id)}
          onKeyDown={(e) => e.key === "Enter" && !previewMode && onOpen?.(l.id)}
        >
          <button
            type="button"
            className={`${k.lessonCheck} ${l.completed ? k.lessonCheckDone : ""}`}
            aria-label={l.completed ? "Marcar como não concluída" : "Marcar como concluída"}
            onClick={(e) => {
              e.stopPropagation();
              if (!previewMode) onToggleComplete?.(l.id, !l.completed);
            }}
          >
            <Check size={15} strokeWidth={3} />
          </button>
          <div className={k.lessonThumbWrap}>
            {l.thumbnailUrl ? (
              <img className={k.lessonThumb} src={l.thumbnailUrl} alt="" />
            ) : (
              <div className={k.lessonThumbFallback}>{l.title}</div>
            )}
            <div className={k.lessonThumbBar}>
              <div className={k.lessonThumbBarFill} style={{ width: l.completed ? "100%" : "0%" }} />
            </div>
          </div>
          <div className={k.lessonTitle}>
            {numberOffset + i + 1}. {l.title}
          </div>
          <div className={k.lessonDur}>{fmtDur(l.duration)}</div>
        </div>
      ))}
    </div>
  );
}

// ── Estrelas (avaliação da aula) ───────────────────────────────────────────
export function StarRating({
  value,
  onChange,
  size = 20,
  disabled,
}: {
  value: number | null | undefined;
  onChange?: (stars: number) => void;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <span className={k.stars} role="radiogroup" aria-label="Avaliar aula">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          className={`${k.starBtn} ${value && s <= value ? k.starOn : ""}`}
          onClick={() => !disabled && onChange?.(s)}
          aria-label={`${s} estrela${s > 1 ? "s" : ""}`}
        >
          <Star size={size} fill={value && s <= value ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
      ))}
    </span>
  );
}

// ── Drawer/acordeão de aulas do player ─────────────────────────────────────
export function LessonDrawer({
  modules,
  currentLessonId,
  onOpen,
  onToggleComplete,
  previewMode,
}: {
  modules: MemberModule[];
  currentLessonId?: string;
  onOpen?: (lessonId: string) => void;
  onToggleComplete?: (lessonId: string, completed: boolean) => void;
  previewMode?: boolean;
}) {
  const startOpen = modules.find((m) => m.lessons.some((l) => l.id === currentLessonId))?.id;
  const [open, setOpen] = useState<Record<string, boolean>>(startOpen ? { [startOpen]: true } : {});
  return (
    <div>
      {modules.map((m) => {
        const isOpen = !!open[m.id];
        return (
          <div key={m.id}>
            <button
              type="button"
              className={k.accordionHead}
              onClick={() => setOpen((o) => ({ ...o, [m.id]: !isOpen }))}
            >
              <span>{m.title}</span>
              <span className={k.accordionCount}>
                {m.completedLessons}/{m.totalLessons}
                {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </span>
            </button>
            {isOpen && (
              <div className={k.drawerLessons}>
                <LessonList
                  lessons={m.lessons}
                  activeLessonId={currentLessonId}
                  onOpen={onOpen}
                  onToggleComplete={onToggleComplete}
                  previewMode={previewMode}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Materiais da aula ──────────────────────────────────────────────────────
export function MaterialList({ materials }: { materials: { name: string; url: string; type?: string }[] }) {
  if (!materials?.length) return null;
  const iconFor = (t?: string) =>
    t === "pdf" ? <FileText size={16} /> : t === "template" || t === "tool" ? <Download size={16} /> : <LinkIcon size={16} />;
  return (
    <div style={{ marginTop: 16 }}>
      {materials.map((m, i) => (
        <a key={i} className={k.materialRow} href={m.url} target="_blank" rel="noopener noreferrer">
          {iconFor(m.type)}
          {m.name || m.url}
        </a>
      ))}
    </div>
  );
}

// ── Card da grade "Meus Cursos" ────────────────────────────────────────────
export function CourseCard({
  course,
  onOpen,
  previewMode,
}: {
  course: { slug: string; name: string; coverUrl?: string | null; pct?: number; totalLessons?: number };
  onOpen?: (slug: string) => void;
  previewMode?: boolean;
}) {
  return (
    <div className={k.courseCard}>
      {course.coverUrl ? (
        <img className={k.courseCover} src={course.coverUrl} alt={course.name} />
      ) : (
        <div className={k.courseCoverFallback}>{course.name}</div>
      )}
      <div className={k.courseBody}>
        <h3 className={k.courseTitle}>{course.name}</h3>
        <button type="button" className={k.courseBtn} onClick={() => !previewMode && onOpen?.(course.slug)}>
          Acessar <Play size={15} fill="currentColor" />
        </button>
        {typeof course.pct === "number" && course.totalLessons ? (
          <>
            <ProgressBar pct={course.pct} />
            <span className={k.coursePct}>{course.pct}% concluído</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
