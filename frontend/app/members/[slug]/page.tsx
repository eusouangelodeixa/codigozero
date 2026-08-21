"use client";
// Home do curso: banner (slides), seções configuráveis (continuar assistindo,
// carrosséis de módulos) dentro do shell tematizado — o "Netflix" do curso.
import { use } from "react";
import k from "@/components/members/kit.module.css";
import { ThemeVars } from "@/components/members/ThemeVars";
import { MembersShell } from "@/components/members/MembersShell";
import { BannerCarousel, ContinueRow, ModuleCarousel } from "@/components/members/widgets";
import { useCourse } from "@/lib/members/useCourse";
import { membersUser } from "@/lib/members/api";
import { memberGo } from "@/lib/members/nav";
import { Lock } from "lucide-react";

export default function CourseHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { data, config, error } = useCourse(slug);
  const user = membersUser();

  if (error) {
    return (
      <div className={k.centerLoad} style={{ minHeight: "100dvh", flexDirection: "column", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <span>{error}</span>
        <a style={{ color: "#2DD4BF" }} href="#" onClick={(e) => { e.preventDefault(); memberGo("/"); }}>← Meus cursos</a>
      </div>
    );
  }
  if (!data || !config) return <div className={k.centerLoad} style={{ minHeight: "100dvh" }}>Carregando…</div>;

  const openLesson = (lessonId: string) => memberGo(`/${slug}/aula/${lessonId}`);
  const openModule = (moduleId: string) => memberGo(`/${slug}/conteudo?modulo=${moduleId}`);

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
            else memberGo(`/${slug}/conteudo`);
          }
        }}
      >
        <BannerCarousel slides={config.home.banner.slides} />

        {/* Curso pago que este aluno ainda não comprou: a estante fica à
            vista, com cadeado nos módulos fechados, e aqui explica-se porquê.
            Esconder o conteúdo por completo não vende nada. */}
        {data.course.locked && (
          <div
            style={{
              margin: "0 0 22px",
              padding: "16px 18px",
              borderRadius: 12,
              border: "1px solid var(--accent-border, rgba(255,255,255,0.14))",
              background: "var(--accent-dim, rgba(255,255,255,0.05))",
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <Lock size={18} />
            <div style={{ flex: 1, minWidth: 220, lineHeight: 1.6 }}>
              <strong>Curso bloqueado.</strong>{" "}
              {data.course.hasSamples
                ? "As aulas de amostra estão liberadas — o resto abre depois da compra."
                : "O conteúdo abre depois da compra."}
            </div>
            {data.course.checkoutUrl && (
              // Mesma aba de propósito (navegador embutido ignora _blank).
              <a
                href={data.course.checkoutUrl}
                style={{
                  padding: "10px 20px",
                  borderRadius: 10,
                  background: "var(--accent, #2DD4BF)",
                  color: "#001412",
                  fontWeight: 700,
                  fontSize: 14,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Comprar o curso →
              </a>
            )}
          </div>
        )}
        {config.home.sections.map((sec) => {
          if (sec.type === "continue") {
            return <ContinueRow key={sec.id} title={sec.title || "Continuar assistindo"} item={data.continue} onOpen={openLesson} />;
          }
          return (
            <ModuleCarousel
              key={sec.id}
              title={sec.title || data.course.name}
              modules={data.modules}
              onOpenModule={openModule}
            />
          );
        })}
        <div style={{ height: 30 }} />
      </MembersShell>
    </ThemeVars>
  );
}
