"use client";
// Editor de conteúdo do coprodutor: mesmo gestor do admin (módulos, aulas,
// vídeo R2, materiais), mas apontando para /api/coproducer e travado ao curso
// que ele coproduz (o backend confere a posse em cada rota).
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CourseContentManager from "@/components/CourseContentManager";
import styles from "../../coproducer.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

type Course = { id: string; name: string; slug: string; status: string };

export default function CoproducerCourseEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(() => {
    fetch(`${API}/api/coproducer/courses/${id}`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d) => setCourse(d.course))
      .catch(() => setNotFound(true));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const togglePublish = async () => {
    if (!course) return;
    setSavingStatus(true);
    try {
      const next = course.status === "published" ? "draft" : "published";
      const r = await fetch(`${API}/api/coproducer/courses/${id}`, { method: "PATCH", headers: hdr(), body: JSON.stringify({ status: next }) });
      const d = await r.json();
      if (r.ok) setCourse((c) => (c ? { ...c, status: d.course?.status || next } : c));
    } finally {
      setSavingStatus(false);
    }
  };

  if (notFound) {
    return (
      <div>
        <div className={styles.pageHead}>
          <span className={styles.pageEyebrow}>Painel do coprodutor</span>
          <h1 className={styles.pageTitle}>Curso não encontrado</h1>
          <p className={styles.pageDesc}>Este curso não está associado à sua coprodução.</p>
        </div>
        <button type="button" className={styles.linkHeroBtnPrimary} onClick={() => router.push("/coproducer/cursos")}>← Voltar aos cursos</button>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Painel do coprodutor · conteúdo</span>
        <h1 className={styles.pageTitle}>{course?.name || "Carregando…"}</h1>
        <p className={styles.pageDesc}>
          Monte os módulos e aulas, envie os vídeos e materiais. As mudanças entram na área de membros do curso.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className={styles.linkHeroBtn} onClick={() => router.push("/coproducer/cursos")}>
            ← Cursos
          </button>
          {course && (
            <button type="button" className={styles.linkHeroBtnPrimary} disabled={savingStatus} onClick={togglePublish}>
              {course.status === "published" ? "Despublicar" : "Publicar curso"}
            </button>
          )}
        </div>
      </div>

      <CourseContentManager courseId={id} apiBase="/api/coproducer" uploadPath="/api/coproducer/upload" />
    </div>
  );
}
