"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { PageHeader, Card, Button, EmptyState } from "@/components/ui";
import { ForjaIcon } from "@/components/Icons";
import styles from "./forja.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

interface Material { name: string; url: string; type: string; }
interface Tool { name: string; description?: string; url: string; }

interface Lesson {
  id: string;
  title: string;
  description?: string;
  videoUrl: string;
  duration?: number;
  tools?: Tool[];
  content?: string;
  materials?: Material[];
  completed: boolean;
}

interface Module {
  id: string;
  title: string;
  description?: string;
  icon?: string;
  totalLessons: number;
  completedLessons: number;
  lessons: Lesson[];
}

const ExternalLink = (p: { size?: number; className?: string }) => (
  <svg className={p.className} width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const Check = (p: { size?: number }) => (
  <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronDown = (p: { size?: number; className?: string }) => (
  <svg className={p.className} width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const materialEmoji = (type: string) => {
  const icons: Record<string, string> = {
    link: "🔗", pdf: "📄", tool: "🛠️", template: "📋", video: "🎬",
  };
  return icons[type] || "📎";
};

const formatDuration = (s?: number) => (s ? `${Math.max(1, Math.floor(s / 60))} min` : "");

export default function ForjaPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [theaterMode, setTheaterMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  useEffect(() => {
    loadModules();
  }, []);

  const loadModules = async () => {
    try {
      const data = await apiClient.getModules();
      setModules(data.modules);
      if (data.modules.length > 0) setExpandedModule(data.modules[0].id);
    } catch (e) {
      console.error("Failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggleComplete = async (lessonId: string, currentState: boolean) => {
    setModules((prev) =>
      prev.map((mod) => {
        const nextLessons = mod.lessons.map((l) =>
          l.id === lessonId ? { ...l, completed: !currentState } : l
        );
        return {
          ...mod,
          lessons: nextLessons,
          completedLessons: nextLessons.reduce((acc, l) => acc + (l.completed ? 1 : 0), 0),
        };
      })
    );
    if (activeLesson?.id === lessonId) {
      setActiveLesson((prev) => (prev ? { ...prev, completed: !currentState } : null));
    }
    try {
      await apiClient.updateProgress(lessonId, !currentState);
    } catch {
      loadModules();
    }
  };

  const lessonIndex = (() => {
    if (!activeLesson) return null;
    for (const mod of modules) {
      const idx = mod.lessons.findIndex((l) => l.id === activeLesson.id);
      if (idx >= 0) return { mod, idx };
    }
    return null;
  })();

  return (
    <div className={styles.page}>
      {/* Theatre backdrop */}
      <div
        className={cx(styles.backdrop, theaterMode && styles.backdropActive)}
        onClick={() => setTheaterMode(false)}
        aria-hidden
      />

      <PageHeader
        label="Arsenal · Forja"
        title="Domine o negócio de IA"
        description="Aulas, ferramentas e materiais para você construir e vender automações sem escrever uma linha de código."
      />

      <div className={styles.layout}>
        {/* ── Player column ── */}
        <div className={cx(styles.playerColumn, theaterMode && styles.playerOnTheatre)}>
          {activeLesson ? (
            <>
              <Card padding="none" className={styles.playerCard}>
                <div className={styles.videoFrame}>
                  {activeLesson.videoUrl ? (
                    <div
                      style={{ width: "100%", height: "100%" }}
                      dangerouslySetInnerHTML={{
                        __html: activeLesson.videoUrl.replace(
                          "<iframe ",
                          '<iframe allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" '
                        ),
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.videoPlaceholder}
                      onClick={() => setTheaterMode((t) => !t)}
                    >
                      <span className={styles.playButton}>
                        <svg width="28" height="28" viewBox="0 0 24 24">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </span>
                      <span className={styles.placeholderTitle}>{activeLesson.title}</span>
                      <span className={styles.placeholderHint}>
                        {theaterMode ? "Sair do modo teatro" : "Ativar modo teatro"}
                      </span>
                    </button>
                  )}
                </div>

                <div className={styles.lessonBar}>
                  <div className={styles.lessonMeta}>
                    <span className={styles.lessonNumber}>
                      {lessonIndex
                        ? `Aula ${String(lessonIndex.idx + 1).padStart(2, "0")} · ${lessonIndex.mod.title}`
                        : "Aula"}
                    </span>
                    <span className={styles.lessonTitle}>{activeLesson.title}</span>
                    {activeLesson.description && (
                      <span className={styles.lessonDesc}>{activeLesson.description}</span>
                    )}
                  </div>
                  <Button
                    variant={activeLesson.completed ? "accent" : "secondary"}
                    onClick={() => toggleComplete(activeLesson.id, activeLesson.completed)}
                    iconStart={activeLesson.completed ? <Check /> : undefined}
                  >
                    {activeLesson.completed ? "Concluída" : "Marcar concluída"}
                  </Button>
                </div>
              </Card>

              {/* Tools */}
              {activeLesson.tools && activeLesson.tools.length > 0 && (
                <section className={cx(styles.section, theaterMode && styles.theatreDimmed)}>
                  <span className={styles.sectionLabel}>Ferramentas recomendadas</span>
                  <div className={styles.resourceList}>
                    {activeLesson.tools.map((tool, i) => (
                      <a
                        key={i}
                        href={tool.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.resource}
                      >
                        <span className={styles.resourceIcon}>🛠️</span>
                        <div className={styles.resourceBody}>
                          <span className={styles.resourceTitle}>{tool.name}</span>
                          {tool.description && <span className={styles.resourceDesc}>{tool.description}</span>}
                        </div>
                        <ExternalLink className={styles.resourceArrow} />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Materials */}
              {activeLesson.materials && activeLesson.materials.length > 0 && (
                <section className={cx(styles.section, theaterMode && styles.theatreDimmed)}>
                  <span className={styles.sectionLabel}>Materiais da aula</span>
                  <div className={styles.resourceList}>
                    {activeLesson.materials.map((mat, i) => (
                      <a
                        key={i}
                        href={mat.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.resource}
                      >
                        <span className={styles.resourceIcon}>{materialEmoji(mat.type)}</span>
                        <div className={styles.resourceBody}>
                          <span className={styles.resourceTitle}>{mat.name}</span>
                          <span className={styles.resourceDesc}>
                            {mat.type.charAt(0).toUpperCase() + mat.type.slice(1)}
                          </span>
                        </div>
                        <ExternalLink className={styles.resourceArrow} />
                      </a>
                    ))}
                  </div>
                </section>
              )}

              {/* Content */}
              {activeLesson.content && (
                <section className={cx(styles.section, theaterMode && styles.theatreDimmed)}>
                  <span className={styles.sectionLabel}>Conteúdo da aula</span>
                  <div className={styles.contentBlock}>{activeLesson.content}</div>
                </section>
              )}
            </>
          ) : (
            <EmptyState
              icon={<ForjaIcon size={26} />}
              title="Escolha uma aula para começar"
              description="Selecione um módulo à direita e clique em uma aula para abrir o player."
            />
          )}
        </div>

        {/* ── Modules column ── */}
        <aside className={cx(styles.modulesColumn, theaterMode && styles.theatreDimmed)}>
          {loading
            ? [1, 2, 3].map((i) => <div key={i} className={styles.skeletonModule} />)
            : modules.map((mod) => {
                const open = expandedModule === mod.id;
                const pct = mod.totalLessons > 0
                  ? Math.round((mod.completedLessons / mod.totalLessons) * 100)
                  : 0;
                return (
                  <div key={mod.id} className={styles.module}>
                    <button
                      type="button"
                      className={styles.moduleHeader}
                      onClick={() => setExpandedModule(open ? null : mod.id)}
                      aria-expanded={open}
                    >
                      <div className={styles.moduleInfo}>
                        <span className={styles.moduleIcon}>{mod.icon || "📚"}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span className={styles.moduleName}>{mod.title}</span>
                          <div className={styles.moduleSubline}>
                            <span className={styles.moduleProgressTrack}>
                              <span
                                className={styles.moduleProgressFill}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                            <span>{mod.completedLessons}/{mod.totalLessons}</span>
                          </div>
                        </div>
                      </div>
                      <ChevronDown
                        className={cx(styles.moduleChevron, open && styles.moduleChevronOpen)}
                      />
                    </button>

                    {open && (
                      <div className={styles.lessonsList}>
                        {mod.lessons.map((lesson, li) => (
                          <button
                            key={lesson.id}
                            type="button"
                            className={cx(
                              styles.lessonItem,
                              activeLesson?.id === lesson.id && styles.lessonItemActive
                            )}
                            onClick={() => {
                              setActiveLesson(lesson);
                              setTheaterMode(false);
                            }}
                          >
                            <span className={styles.lessonItemNumber}>
                              {String(li + 1).padStart(2, "0")}
                            </span>
                            <span className={styles.lessonItemBody}>
                              <span className={styles.lessonItemTitle}>{lesson.title}</span>
                              {lesson.duration && (
                                <span className={styles.lessonItemDuration}>
                                  {formatDuration(lesson.duration)}
                                </span>
                              )}
                            </span>
                            {lesson.completed && (
                              <span className={styles.lessonItemCheck}>
                                <Check />
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
        </aside>
      </div>
    </div>
  );
}
