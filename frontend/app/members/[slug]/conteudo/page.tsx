"use client";
// Página do curso: hero com "Retomar", contagens, dropdown de módulo com
// busca e a lista de aulas do módulo selecionado (checkbox de conclusão).
import { Suspense, use, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Play } from "lucide-react";
import k from "@/components/members/kit.module.css";
import { ThemeVars } from "@/components/members/ThemeVars";
import { MembersShell } from "@/components/members/MembersShell";
import { LessonList } from "@/components/members/widgets";
import { useCourse } from "@/lib/members/useCourse";
import { membersUser } from "@/lib/members/api";
import { memberGo } from "@/lib/members/nav";

export default function CourseContent({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className={k.centerLoad} style={{ minHeight: "100dvh" }}>Carregando…</div>}>
      <CourseContentInner params={params} />
    </Suspense>
  );
}

function CourseContentInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const moduloParam = useSearchParams().get("modulo");
  const { data, config, error, toggleComplete } = useCourse(slug);
  const user = membersUser();
  const [selectedId, setSelectedId] = useState<string | null>(moduloParam);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => {
    if (!data) return null;
    return data.modules.find((m) => m.id === (selectedId || moduloParam)) || data.modules[0] || null;
  }, [data, selectedId, moduloParam]);

  if (error) return <div className={k.centerLoad} style={{ minHeight: "100dvh" }}>{error}</div>;
  if (!data || !config) return <div className={k.centerLoad} style={{ minHeight: "100dvh" }}>Carregando…</div>;

  const totalLessons = data.modules.reduce((a, m) => a + m.totalLessons, 0);
  const heroSlide = config.home.banner.slides[0];
  const filteredModules = data.modules.filter((m) =>
    !search.trim() || m.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const openLesson = (lessonId: string) => memberGo(`/${slug}/aula/${lessonId}`);
  // Numeração global: offset = aulas dos módulos anteriores ao selecionado.
  const numberOffset = selected
    ? data.modules.slice(0, data.modules.indexOf(selected)).reduce((a, m) => a + m.lessons.length, 0)
    : 0;

  return (
    <ThemeVars config={config}>
      <MembersShell
        config={config}
        courseName={data.course.name}
        user={user}
        activeItemId="home"
        onItemClick={(item) => {
          if (item.type === "home") memberGo(`/${slug}`);
          if (item.type === "continue") {
            if (data.continue) openLesson(data.continue.lessonId);
          }
        }}
      >
        {heroSlide && (
          <div className={k.courseHero}>
            <div className={k.banner} style={{ position: "relative" }}>
              <img src={heroSlide.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />
            </div>
            {data.continue && (
              <div className={k.courseHeroOverlay}>
                <span className={k.heroLessonTitle}>{data.continue.title}</span>
                <button type="button" className={k.resumeBtn} onClick={() => openLesson(data.continue!.lessonId)}>
                  <Play size={17} fill="currentColor" /> Retomar
                </button>
              </div>
            )}
          </div>
        )}

        <div className={k.courseMeta}>
          <h1 className={k.courseName}>{data.course.name}</h1>
          <p className={k.courseCounts}>
            {data.modules.length} módulo{data.modules.length === 1 ? "" : "s"} · {totalLessons} aula{totalLessons === 1 ? "" : "s"}
          </p>

          <div className={k.moduleSelect} role="button" tabIndex={0} onClick={() => setPickerOpen((o) => !o)}>
            <span>{selected ? selected.title : "Selecione um módulo"}</span>
            <ChevronDown size={17} />
            {pickerOpen && (
              <div className={k.modulePop} onClick={(e) => e.stopPropagation()}>
                <input
                  className={k.moduleSearch}
                  placeholder="Buscar…"
                  value={search}
                  autoFocus
                  onChange={(e) => setSearch(e.target.value)}
                />
                {filteredModules.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={k.moduleOpt}
                    onClick={() => {
                      setSelectedId(m.id);
                      setPickerOpen(false);
                      setSearch("");
                    }}
                  >
                    <span>{m.title}</span>
                    <span className={k.accordionCount}>{m.completedLessons}/{m.totalLessons}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <LessonList
              lessons={selected.lessons}
              numberOffset={numberOffset}
              onOpen={openLesson}
              onToggleComplete={toggleComplete}
            />
          )}
          <div style={{ height: 30 }} />
        </div>
      </MembersShell>
    </ThemeVars>
  );
}
