"use client";
import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import styles from "./forja.module.css";

interface Lesson {
  id: string;
  title: string;
  description?: string;
  videoUrl: string;
  duration?: number;
  tools?: any;
  content?: string;
  materials?: { name: string; url: string; type: string }[];
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

export default function ForjaPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [theaterMode, setTheaterMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  useEffect(() => { loadModules(); }, []);

  const loadModules = async () => {
    try {
      const data = await apiClient.getModules();
      setModules(data.modules);
      if (data.modules.length > 0) setExpandedModule(data.modules[0].id);
    } catch (e) { console.error("Failed:", e); }
    finally { setLoading(false); }
  };

  const toggleComplete = async (lessonId: string, currentState: boolean) => {
    // Optimistic update (spec: update progress bar before backend confirmation)
    setModules(prev =>
      prev.map(mod => ({
        ...mod,
        lessons: mod.lessons.map(l =>
          l.id === lessonId ? { ...l, completed: !currentState } : l
        ),
        completedLessons: mod.lessons.reduce((acc, l) =>
          acc + (l.id === lessonId ? (!currentState ? 1 : 0) : (l.completed ? 1 : 0)), 0),
      }))
    );
    if (activeLesson?.id === lessonId) {
      setActiveLesson(prev => prev ? { ...prev, completed: !currentState } : null);
    }
    try { await apiClient.updateProgress(lessonId, !currentState); }
    catch { loadModules(); }
  };

  const formatDuration = (s?: number) => s ? `${Math.floor(s / 60)} min` : "";

  const materialIcon = (type: string) => {
    const icons: Record<string, string> = { link: "🔗", pdf: "📄", tool: "🛠️", template: "📋", video: "🎬" };
    return icons[type] || "📎";
  };

  return (
    <div className={styles.page}>
      {/* Theatre Backdrop */}
      {theaterMode && (
        <div
          className={`${styles.forgeBackdrop} ${styles.forgeBackdropActive}`}
          onClick={() => setTheaterMode(false)}
        />
      )}

      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Aulas</span>
        <h1 className={styles.sectionTitle}>Domine o negócio de IA</h1>
        <p className={styles.sectionDescription}>Assista as aulas e complete os módulos para avançar.</p>
      </div>

      <div className={styles.layout}>
        {/* Player */}
        <div className={styles.playerColumn}>
          {activeLesson ? (
            <div className={`${styles.playerWrapper} ${theaterMode ? styles.theaterPlayer : ""}`}>
              <div className={styles.videoContainer}>
                {activeLesson.videoUrl ? (
                  <div 
                    className={styles.videoEmbed}
                    dangerouslySetInnerHTML={{ 
                      __html: activeLesson.videoUrl.replace('<iframe ', '<iframe allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" ') 
                    }} 
                  />
                ) : (
                  <div className={styles.videoPlaceholder} onClick={() => setTheaterMode(!theaterMode)}>
                    <div className={styles.playButton}>
                      <svg width="32" height="32" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    </div>
                    <p className={styles.videoTitle}>{activeLesson.title}</p>
                    <p className={styles.videoHint}>
                      {theaterMode ? "Sair do Modo Teatro" : "Ativar Modo Teatro"}
                    </p>
                  </div>
                )}
              </div>

              <div className={styles.lessonInfo}>
                <div className={styles.lessonMeta}>
                  <h2 className={styles.lessonTitle}>{activeLesson.title}</h2>
                  {activeLesson.description && <p className={styles.lessonDesc}>{activeLesson.description}</p>}
                </div>
                <button
                  className={`${styles.completeBtn} ${activeLesson.completed ? styles.completeBtnDone : ""}`}
                  onClick={() => toggleComplete(activeLesson.id, activeLesson.completed)}>
                  {activeLesson.completed ? "✓ Concluída" : "Marcar Concluída"}
                </button>
              </div>

              {/* Tools */}
              {activeLesson.tools && Array.isArray(activeLesson.tools) && activeLesson.tools.length > 0 && (
                <div className={`${styles.toolsSection} ${theaterMode ? styles.theatreDimmed : ""}`}>
                  <h3 className={styles.toolsTitle}>Ferramentas Recomendadas</h3>
                  <div className={styles.toolsList}>
                    {activeLesson.tools.map((tool: any, i: number) => (
                      <a key={i} href={tool.url} target="_blank" rel="noopener noreferrer" className={styles.toolLink}>
                        <span className={styles.toolName}>{tool.name}</span>
                        <span className={styles.toolDesc}>{tool.description}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Materials */}
              {activeLesson.materials && activeLesson.materials.length > 0 && (
                <div className={`${styles.toolsSection} ${theaterMode ? styles.theatreDimmed : ""}`}>
                  <h3 className={styles.toolsTitle}>📎 Materiais da Aula</h3>
                  <div className={styles.toolsList}>
                    {activeLesson.materials.map((mat, i) => (
                      <a key={i} href={mat.url} target="_blank" rel="noopener noreferrer" className={styles.toolLink}>
                        <span className={styles.toolName}>{materialIcon(mat.type)} {mat.name}</span>
                        <span className={styles.toolDesc}>{mat.type.charAt(0).toUpperCase() + mat.type.slice(1)}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                          <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Lesson Content (Markdown-like) */}
              {activeLesson.content && (
                <div className={`${styles.toolsSection} ${theaterMode ? styles.theatreDimmed : ""}`}
                  style={{ borderTop: "1px solid rgba(45,212,191,0.08)", paddingTop: 20 }}>
                  <h3 className={styles.toolsTitle}>📝 Conteúdo da Aula</h3>
                  <div style={{
                    color: "#ccc", fontSize: 14, lineHeight: 1.7,
                    whiteSpace: "pre-wrap", padding: "12px 0",
                  }}>
                    {activeLesson.content}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.noLesson}>
              <span className={styles.noLessonIcon}>📺</span>
              <p>Selecione uma aula para começar</p>
            </div>
          )}
        </div>

        {/* Modules */}
        <div className={`${styles.modulesColumn} ${theaterMode ? styles.theatreDimmed : ""}`}>
          {loading ? [1,2,3].map(i => <div key={i} className={styles.skeletonModule} />)
          : modules.map(mod => (
            <div key={mod.id} className={styles.moduleCard}>
              <button className={styles.moduleHeader}
                onClick={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}>
                <div className={styles.moduleInfo}>
                  <span className={styles.moduleIcon}>{mod.icon || "📚"}</span>
                  <div>
                    <h3 className={styles.moduleName}>{mod.title}</h3>
                    <span className={styles.moduleProgress}>
                      {mod.completedLessons}/{mod.totalLessons} concluídas
                    </span>
                  </div>
                </div>
                <svg className={`${styles.expandIcon} ${expandedModule === mod.id ? styles.expandIconOpen : ""}`}
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {expandedModule === mod.id && (
                <div className={styles.lessonsList}>
                  {mod.lessons.map((lesson, li) => (
                    <button key={lesson.id}
                      className={`${styles.lessonItem} ${activeLesson?.id === lesson.id ? styles.lessonItemActive : ""}`}
                      onClick={() => { setActiveLesson(lesson); setTheaterMode(false); }}>
                      <span className={styles.lessonNumber}>{String(li + 1).padStart(2, '0')}</span>
                      <div className={styles.lessonItemInfo}>
                        <span className={styles.lessonItemTitle}>{lesson.title}</span>
                        {lesson.duration && <span className={styles.lessonDuration}>{formatDuration(lesson.duration)}</span>}
                      </div>
                      {lesson.completed && (
                        <svg className={styles.checkIcon} width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="var(--color-success)" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
