"use client";
// Feed de Atividade: o registro consultável dos eventos operacionais (venda de
// curso, aluno matriculado por coprodutor, …). O push avisa na hora; isto é
// para quem não estava com o telefone na mão.
import { useCallback, useEffect, useState } from "react";
import styles from "../admin.module.css";
import { AdminPage } from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface AdminEvent {
  id: string;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
}

const TYPE_META: Record<string, { label: string; icon: string }> = {
  course_sale: { label: "Venda de curso", icon: "🎓" },
  copro_enroll: { label: "Matrícula por coprodutor", icon: "👤" },
};

const FILTERS = [
  { id: "", label: "Tudo" },
  { id: "course_sale", label: "Vendas de curso" },
  { id: "copro_enroll", label: "Matrículas de coprodutor" },
];

export default function AtividadePage() {
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, t: string, append: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (t) params.set("type", t);
      const r = await fetch(`${API}/api/admin/events?${params}`, { headers: hdr() });
      if (r.ok) {
        const d = await r.json();
        setTotal(d.total || 0);
        setEvents((cur) => (append ? [...cur, ...(d.events || [])] : d.events || []));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    void load(1, type, false);
  }, [type, load]);

  return (
    <AdminPage
      eyebrow="Operação"
      title="Atividade"
      desc="O que aconteceu no sistema: vendas de curso, matrículas feitas por coprodutores e outros eventos operacionais."
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setType(f.id)}
            style={{
              padding: "7px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              border: "1px solid",
              borderColor: type === f.id ? "var(--accent)" : "var(--border-glass)",
              background: type === f.id ? "rgba(45,212,191,0.12)" : "transparent",
              color: type === f.id ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {events.length === 0 && !loading ? (
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>Nenhum evento registrado ainda.</p>
        ) : (
          events.map((ev) => {
            const meta = TYPE_META[ev.type] || { label: ev.type, icon: "•" };
            return (
              <div
                key={ev.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "12px 4px",
                  borderBottom: "1px solid var(--border-glass)",
                  alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1.3 }}>{meta.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{ev.title}</div>
                  {ev.body && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>{ev.body}</div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                  {new Date(ev.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            );
          })
        )}
        {loading && <p style={{ color: "var(--text-secondary)", margin: "12px 0 0" }}>Carregando…</p>}
        {!loading && events.length < total && (
          <button
            type="button"
            className={styles.btnSecondary}
            style={{ marginTop: 14 }}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              void load(next, type, true);
            }}
          >
            Carregar mais ({events.length}/{total})
          </button>
        )}
      </div>
    </AdminPage>
  );
}
