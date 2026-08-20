"use client";
// Cursos associados a esta coprodução: alunos + faturamento por curso, e a
// matrícula manual de alunos (vitalícia, só o curso). Cada matrícula avisa o
// superadmin por push e entra no feed de Atividade do admin — transparência
// total entre coprodutor e dono.
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../coproducer.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface CoproCourse {
  id: string;
  name: string;
  slug: string;
  status: string;
  coverUrl: string | null;
  accessType: string;
  students: number;
  sales: number;
  revenue: number;
  yourSharePct: number;
}

interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  lifetime: boolean;
  createdAt: string;
}

const SOURCE_LABEL: Record<string, string> = {
  purchase: "Compra",
  import: "Importação",
  manual: "Admin",
  coproducer: "Você",
};

const fmtMZN = (v: number) => `${(v || 0).toLocaleString("pt-MZ", { maximumFractionDigits: 0 })} MT`;

export default function CoproducerCourses() {
  const router = useRouter();
  const [courses, setCourses] = useState<CoproCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [students, setStudents] = useState<Record<string, { total: number; rows: Student[] }>>({});
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/coproducer/courses`, { headers: hdr() });
      if (r.ok) setCourses((await r.json()).courses || []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadStudents = useCallback(async (courseId: string) => {
    const r = await fetch(`${API}/api/coproducer/courses/${courseId}/students`, { headers: hdr() });
    if (r.ok) {
      const d = await r.json();
      setStudents((s) => ({ ...s, [courseId]: { total: d.total, rows: d.students || [] } }));
    }
  }, []);

  const toggle = (courseId: string) => {
    const next = open === courseId ? null : courseId;
    setOpen(next);
    setMsg(null);
    if (next && !students[next]) void loadStudents(next);
  };

  const addStudent = async (courseId: string) => {
    if (saving) return;
    if (!form.email.trim() && !form.phone.trim()) {
      setMsg({ kind: "err", text: "Informe e-mail ou telefone do aluno." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(`${API}/api/coproducer/courses/${courseId}/students`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) {
        setMsg({ kind: "err", text: d.error || "Não foi possível matricular." });
        return;
      }
      setMsg({ kind: "ok", text: "Aluno matriculado! As credenciais saem pela fila de entrega (e-mail primeiro)." });
      setForm({ name: "", email: "", phone: "" });
      void loadStudents(courseId);
      void load();
    } catch {
      setMsg({ kind: "err", text: "Erro de conexão. Tente de novo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Painel do coprodutor</span>
        <h1 className={styles.pageTitle}>Cursos</h1>
        <p className={styles.pageDesc}>
          Os cursos da área de membros associados à sua coprodução: alunos, vendas e matrícula manual.
        </p>
      </div>

      {loading ? (
        <div className={styles.loading}>Carregando…</div>
      ) : courses.length === 0 ? (
        <div className={styles.tableCard}>
          <div className={styles.tableEmpty}>Nenhum curso associado à sua coprodução ainda.</div>
        </div>
      ) : (
        courses.map((c) => (
          <div key={c.id} className={styles.tableCard} style={{ marginBottom: 16 }}>
            <div className={styles.tableHead}>
              <span className={styles.tableTitle} style={{ cursor: "pointer" }} onClick={() => toggle(c.id)}>
                {c.name}{" "}
                <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 12 }}>
                  {c.status === "published" ? "publicado" : "rascunho"}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <button
                  type="button"
                  className={styles.linkHeroBtnPrimary}
                  style={{ padding: "6px 14px", fontSize: 13 }}
                  onClick={() => router.push(`/coproducer/cursos/${c.id}`)}
                >
                  Gerir conteúdo →
                </button>
                <span className={styles.tableHint} style={{ cursor: "pointer" }} onClick={() => toggle(c.id)}>
                  {open === c.id ? "▲ alunos" : "▼ alunos"}
                </span>
              </span>
            </div>

            <div className={styles.statsGrid} style={{ padding: "14px 16px" }}>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Alunos</div>
                <div className={styles.statValue}>{c.students}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Vendas</div>
                <div className={styles.statValue}>{c.sales}</div>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statLabel}>Faturamento</div>
                <div className={styles.statValue}>{fmtMZN(c.revenue)}</div>
                <div className={styles.statSub}>sua parte: {c.yourSharePct}% (acerto por fora)</div>
              </div>
            </div>

            {open === c.id && (
              <div style={{ padding: "0 16px 16px" }}>
                {/* Matrícula manual */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 8 }}>
                  <input
                    className={styles.searchInput}
                    style={{ flex: "1 1 140px" }}
                    placeholder="Nome"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <input
                    className={styles.searchInput}
                    style={{ flex: "1 1 180px" }}
                    placeholder="E-mail"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <input
                    className={styles.searchInput}
                    style={{ flex: "1 1 140px" }}
                    placeholder="WhatsApp (84xxxxxxx)"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <button
                    type="button"
                    className={styles.linkHeroBtnPrimary}
                    disabled={saving}
                    onClick={() => addStudent(c.id)}
                  >
                    {saving ? "Matriculando…" : "+ Matricular aluno"}
                  </button>
                </div>
                <p style={{ fontSize: 12, opacity: 0.65, margin: "0 0 12px" }}>
                  Acesso vitalício ao curso (sem a plataforma). O aluno recebe as credenciais citando o curso; o
                  admin é avisado de cada matrícula.
                </p>
                {msg && (
                  <p style={{ fontSize: 13, fontWeight: 600, color: msg.kind === "ok" ? "#22c55e" : "#ef4444", margin: "0 0 12px" }}>
                    {msg.text}
                  </p>
                )}

                {/* Alunos */}
                {students[c.id] ? (
                  students[c.id].rows.length === 0 ? (
                    <div className={styles.tableEmpty}>Ainda sem alunos.</div>
                  ) : (
                    <>
                      <div className={styles.tableHint} style={{ marginBottom: 8 }}>
                        {students[c.id].total} aluno(s) — mostrando os {students[c.id].rows.length} mais recentes
                      </div>
                      {students[c.id].rows.map((s) => (
                        <div key={s.id} className={styles.userCard}>
                          <div>
                            <div className={styles.userName}>{s.name}</div>
                            <div className={styles.userMeta}>
                              {s.email} · {s.phone}
                            </div>
                          </div>
                          <div className={styles.userMeta} style={{ textAlign: "right" }}>
                            {SOURCE_LABEL[s.source] || s.source} · {s.lifetime ? "vitalício" : "expira"}
                            <br />
                            {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                          </div>
                        </div>
                      ))}
                    </>
                  )
                ) : (
                  <div className={styles.loading}>Carregando alunos…</div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
