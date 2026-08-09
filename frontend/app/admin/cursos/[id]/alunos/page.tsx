"use client";

// Alunos do curso — mesmo desenho da Kiwify: métricas no topo, busca, tabela
// com último acesso e progresso, "Adicionar aluno" e atalho para a importação
// em massa.
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Search, Trash2, Users } from "lucide-react";
import { AdminPage } from "@/components/admin";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ui";
import styles from "../../../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("cz_token") : ""}`,
});

type Aluno = {
  id: string;
  name: string;
  email: string;
  phone: string;
  lastAccess: string | null;
  completedLessons: number;
  totalLessons: number;
  pct: number;
  access: { source: string; expiresAt: string | null; lifetime: boolean; since: string } | null;
};
type Metrics = {
  total: number;
  avgProgress: number;
  completionRate: number;
  subscribersWithPlanAccess: number;
};

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "----";

export default function AlunosDoCurso({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();

  const [curso, setCurso] = useState<{ name: string; slug: string } | null>(null);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [novo, setNovo] = useState({ name: "", email: "", phone: "" });
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(() => {
    setCarregando(true);
    Promise.all([
      fetch(`${API}/api/admin/members/courses/${id}`, { headers: hdr() }).then((r) => r.json()),
      fetch(`${API}/api/admin/members/courses/${id}/students`, { headers: hdr() }).then((r) => r.json()),
    ])
      .then(([c, s]) => {
        if (c?.course) setCurso({ name: c.course.name, slug: c.course.slug });
        setAlunos(s.students || []);
        setMetrics(s.metrics || null);
      })
      .catch(() => toast.error("Falha ao carregar alunos"))
      .finally(() => setCarregando(false));
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return alunos;
    return alunos.filter((a) => `${a.name} ${a.email} ${a.phone}`.toLowerCase().includes(q));
  }, [alunos, busca]);

  const adicionar = async () => {
    if (!novo.email.trim() || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch(`${API}/api/admin/members/courses/${id}/students`, {
        method: "POST", headers: hdr(), body: JSON.stringify(novo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Erro");
      toast.success(d.created ? "Aluno adicionado — credenciais na fila" : "Acesso concedido");
      setAddOpen(false);
      setNovo({ name: "", email: "", phone: "" });
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (aluno: Aluno) => {
    if (!confirm(`Remover o acesso de ${aluno.name || aluno.email} a este curso?`)) return;
    try {
      const r = await fetch(`${API}/api/admin/members/courses/${id}/students/${aluno.id}`, {
        method: "DELETE", headers: hdr(),
      });
      if (!r.ok) throw new Error();
      toast.success("Acesso removido");
      load();
    } catch {
      toast.error("Não consegui remover");
    }
  };

  const exportar = () => {
    const linhas = [
      ["Nome", "E-mail", "WhatsApp", "Último acesso", "Progresso", "Acesso"].join(","),
      ...filtrados.map((a) =>
        [
          `"${a.name}"`, a.email, a.phone,
          a.lastAccess ? new Date(a.lastAccess).toISOString().slice(0, 10) : "",
          `${a.pct}%`,
          a.access ? (a.access.lifetime ? "vitalicio" : "temporario") : "pelo plano",
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([linhas], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `alunos-${curso?.slug || id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminPage
      eyebrow="Conteúdo"
      title={curso ? `${curso.name} · Alunos` : "Alunos"}
      desc="Quem tem direito a este curso, com progresso e último acesso."
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push(`/admin/cursos/${id}`)}>
            ← Conteúdo
          </button>
          <button type="button" className={styles.btnSecondary} onClick={exportar} disabled={filtrados.length === 0}>
            <Download size={15} /> Exportar
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Adicionar aluno
          </button>
        </div>
      }
    >
      <div style={{ position: "relative", marginBottom: 18 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
        <input
          className={styles.formInput}
          style={{ paddingLeft: 36 }}
          placeholder="Buscar por nome, e-mail ou WhatsApp…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
        {[
          { label: "Número de alunos", valor: String(metrics?.total ?? 0), sub: "com direito ao curso" },
          { label: "Progresso", valor: `${metrics?.avgProgress ?? 0} %`, sub: "média dos alunos" },
          { label: "Conclusão", valor: `${metrics?.completionRate ?? 0} %`, sub: "concluíram o curso" },
        ].map((m) => (
          <div key={m.label} className={styles.card} style={{ padding: 18 }}>
            <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>{m.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{m.valor}</div>
            <div style={{ color: "var(--text-tertiary)", fontSize: 13, marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {!!metrics?.subscribersWithPlanAccess && (
        <p style={{ color: "var(--text-tertiary)", marginBottom: 16, lineHeight: 1.6 }}>
          <Users size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          Mais <strong>{metrics.subscribersWithPlanAccess}</strong> assinante(s) veem este curso pelo plano. Só aparecem
          na lista depois de abrirem alguma aula — senão a tabela seria a base inteira.
        </p>
      )}

      <div className={styles.card} style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                {["Nome", "Último acesso", "Progresso", "Acesso", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "12px 14px", fontWeight: 600, color: "var(--text-secondary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {carregando && (
                <tr><td colSpan={5} style={{ padding: 24, color: "var(--text-tertiary)" }}>Carregando…</td></tr>
              )}
              {!carregando && filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 28, color: "var(--text-tertiary)" }}>
                    {busca ? "Ninguém encontrado com esse termo." : "Ainda sem alunos neste curso."}
                  </td>
                </tr>
              )}
              {filtrados.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 600 }}>{a.name || "—"}</div>
                    <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>{a.email}</div>
                  </td>
                  <td style={{ padding: "12px 14px", color: a.lastAccess ? undefined : "var(--text-tertiary)" }}>
                    {fmtData(a.lastAccess)}
                  </td>
                  <td style={{ padding: "12px 14px", minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border-default)", overflow: "hidden" }}>
                        <div style={{ width: `${a.pct}%`, height: "100%", background: "var(--accent)" }} />
                      </div>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{a.pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px", color: "var(--text-secondary)" }}>
                    {a.access ? (a.access.lifetime ? "Vitalício" : `Até ${fmtData(a.access.expiresAt)}`) : "Pelo plano"}
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    {a.access && (
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => remover(a)}
                        title="Remover acesso a este curso"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Adicionar aluno" size="sm">
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Nome do aluno</label>
          <input className={styles.formInput} value={novo.name} onChange={(e) => setNovo((n) => ({ ...n, name: e.target.value }))} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>E-mail</label>
          <input className={styles.formInput} value={novo.email} onChange={(e) => setNovo((n) => ({ ...n, email: e.target.value }))} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>WhatsApp (opcional)</label>
          <input className={styles.formInput} value={novo.phone} onChange={(e) => setNovo((n) => ({ ...n, phone: e.target.value }))} />
          <p className={styles.formHint}>
            Dá acesso vitalício a este curso. Se a pessoa ainda não tem conta, ela é criada e as credenciais entram na
            fila — e-mail primeiro.
          </p>
        </div>
        <div className={styles.btnRow}>
          <button type="button" className={styles.btnSecondary} onClick={() => setAddOpen(false)}>Cancelar</button>
          <button type="button" className={styles.btnPrimary} onClick={adicionar} disabled={!novo.email.trim() || salvando}>
            {salvando ? "Adicionando…" : "Adicionar aluno"}
          </button>
        </div>
        <button
          type="button"
          onClick={() => router.push("/admin/turma")}
          style={{
            display: "block", width: "100%", marginTop: 14, background: "none", border: "none",
            color: "var(--accent)", cursor: "pointer", fontSize: 14,
          }}
        >
          Importar alunos em massa
        </button>
      </Modal>
    </AdminPage>
  );
}
