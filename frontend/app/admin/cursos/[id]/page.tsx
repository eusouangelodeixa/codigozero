"use client";
// Gestor de conteúdo de um curso: coluna de módulos (drag para reordenar,
// capa vertical) e coluna de aulas do módulo selecionado (drag, modal com
// abas Básico/Conteúdo/Materiais, thumb, mover de módulo). DnD nativo HTML5
// (mesmo padrão do /admin/conteudo).
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminPage } from "@/components/admin";
import { useToast } from "@/components/ui";
import CourseContentManager from "@/components/CourseContentManager";
import styles from "../../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

// O conteúdo (módulos/aulas/vídeo) foi extraído para <CourseContentManager>.
// Aqui ficam só o cabeçalho e o card comercial "Acesso e venda".
type Course = {
  id: string; name: string; slug: string; status: string;
  accessType?: string; includedInSubscription?: boolean; productPid?: string | null; webhookToken?: string | null;
  includedTools?: string[] | null;
  coproducerId?: string | null; checkoutUrl?: string | null;
};

type CoproOption = { id: string; code: string; displayName?: string | null; user?: { name?: string } };

export default function AdminCursoConteudo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const router = useRouter();
  const [course, setCourse] = useState<Course | null>(null);

  const load = useCallback(() => {
    fetch(`${API}/api/admin/members/courses/${id}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (!d.course) throw new Error(d.error);
        setCourse(d.course);
      })
      .catch(() => toast.error("Falha ao carregar curso"));
  }, [id, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const api = async (path: string, method: string, body?: unknown) => {
    const r = await fetch(`${API}${path}`, { method, headers: hdr(), body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Erro");
    return d;
  };

  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copros, setCopros] = useState<CoproOption[]>([]);

  // Lista de coprodutores para o seletor (um coprodutor por curso).
  useEffect(() => {
    fetch(`${API}/api/admin/coproducers?pageSize=100`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => setCopros(d.coproducers || d.items || []))
      .catch(() => {});
  }, []);

  // Guarda tipo de acesso / pid. Recarrega para o ecrã reflectir o que ficou.
  const saveAccess = async (patch: Record<string, unknown>) => {
    try {
      await api(`/api/admin/members/courses/${id}`, "PATCH", patch);
      toast.success("Acesso atualizado");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const gerarWebhook = async () => {
    try {
      const d = await api(`/api/admin/members/courses/${id}/webhook-token`, "POST");
      setWebhookUrl(d.webhookUrl);
      toast.success("URL gerada — cole na Lojou");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!course) return <AdminPage eyebrow="Conteúdo" title="Cursos"><p style={{ color: "var(--text-tertiary)" }}>Carregando…</p></AdminPage>;

  return (
    <AdminPage
      eyebrow="Conteúdo"
      title={course.name}
      desc={`Gestor de conteúdo · members.czero.sbs/${course.slug}`}
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push("/admin/cursos")}>
            ← Cursos
          </button>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push(`/admin/cursos/${id}/alunos`)}>
            Alunos
          </button>
          <button type="button" className={styles.btnPrimary} onClick={() => router.push(`/admin/cursos/${id}/editor`)}>
            Editor visual →
          </button>
        </div>
      }
    >
      {/* ── Acesso e venda ──────────────────────────────────────────────── */}
      <div className={styles.card} style={{ marginBottom: 18 }}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Acesso e venda</span>
        </div>

        {/* Dois eixos INDEPENDENTES: pode marcar os dois (curso híbrido). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              style={{ marginTop: 3 }}
              checked={course.includedInSubscription !== false}
              onChange={(e) => saveAccess({ includedInSubscription: e.target.checked })}
            />
            <span>
              <strong>Incluído na assinatura</strong>
              <span className={styles.formHint} style={{ display: "block" }}>
                Todo assinante em dia abre este curso, sem comprar à parte.
              </span>
            </span>
          </label>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input
              type="checkbox"
              style={{ marginTop: 3 }}
              checked={(course.accessType || "subscription") === "paid"}
              onChange={(e) => saveAccess({ accessType: e.target.checked ? "paid" : "subscription" })}
            />
            <span>
              <strong>Vender à parte (compra avulsa)</strong>
              <span className={styles.formHint} style={{ display: "block" }}>
                Cria vitrine com cadeado e botão comprar. Quem compra de fora acessa só este curso.
                Marque os dois para um curso que é <em>incluído no plano E vendido avulso</em>.
              </span>
            </span>
          </label>
          <p className={styles.formHint} style={{ margin: 0 }}>
            Acesso vitalício concedido (turma/manual) sempre entra, em qualquer combinação.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {(course.accessType || "subscription") === "paid" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>PID do produto na Lojou</label>
              <input
                className={styles.formInput}
                defaultValue={course.productPid || ""}
                placeholder="uoEHz"
                onBlur={(e) => saveAccess({ productPid: e.target.value.trim() })}
              />
              <p className={styles.formHint}>
                Confere se a venda recebida é mesmo deste curso. Sem ele, o webhook de outro produto libertaria este.
              </p>
            </div>
          )}

          {(course.accessType || "subscription") === "paid" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Link de compra (checkout)</label>
              <input
                className={styles.formInput}
                defaultValue={course.checkoutUrl || ""}
                placeholder="https://pay.lojou.app/{pid}"
                onBlur={(e) => saveAccess({ checkoutUrl: e.target.value.trim() })}
              />
              <p className={styles.formHint}>
                Vira o botão &quot;Comprar o curso&quot; no cadeado da área de membros. Use o link permanente do
                produto na Lojou, pay.lojou.app/{"{pid}"} (o /token/ expira em horas).
              </p>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Coprodutor deste curso</label>
            <select
              className={styles.formInput}
              value={course.coproducerId || ""}
              onChange={(e) => saveAccess({ coproducerId: e.target.value || null })}
            >
              <option value="">— Nenhum —</option>
              {copros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName || c.user?.name || c.code}
                </option>
              ))}
            </select>
            <p className={styles.formHint}>
              O coprodutor passa a ver alunos e faturamento deste curso no painel dele, e pode matricular alunos
              (cada matrícula te avisa por push e fica no feed de Atividade). O acerto é por fora — nada entra no
              rateio de sócios.
            </p>
          </div>
        </div>

        <div className={styles.formGroup} style={{ marginTop: 4 }}>
          <label className={styles.formLabel}>Ferramentas que este curso libera</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 4 }}>
            <input
              type="checkbox"
              checked={course.includedTools === null || course.includedTools === undefined
                ? true
                : course.includedTools.includes("komunika")}
              onChange={(e) =>
                saveAccess({ includedTools: e.target.checked ? ["komunika"] : [] })
              }
            />
            <span>Komunika (automação de WhatsApp)</span>
          </label>
          <p className={styles.formHint}>
            Desmarque para turmas que compraram só o curso. Sem isto, o aluno vê no lugar do botão um convite para
            conhecer o Komunika — e passa a ter a ferramenta no dia em que assinar o Código Zero. Não mexe em quem já
            é assinante.
          </p>
        </div>

        {(course.accessType || "subscription") === "paid" && (
          <div className={styles.formGroup} style={{ marginTop: 4 }}>
            <label className={styles.formLabel}>URL do webhook deste curso</label>
            {webhookUrl ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <code
                  style={{
                    flex: 1, minWidth: 260, padding: "10px 12px", borderRadius: 8,
                    background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
                    fontSize: 12, wordBreak: "break-all",
                  }}
                >
                  {webhookUrl}
                </code>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    void navigator.clipboard.writeText(webhookUrl);
                    toast.success("Copiado");
                  }}
                >
                  Copiar
                </button>
              </div>
            ) : (
              <button type="button" className={styles.btnSecondary} onClick={gerarWebhook}>
                Gerar URL do webhook
              </button>
            )}
            <p className={styles.formHint}>
              Cole na Lojou, no produto deste curso. É uma rota EXCLUSIVA dele — o webhook principal do Código Zero não
              confere produto nenhum e daria a plataforma inteira a quem comprasse só o curso. Gerar de novo invalida a
              anterior.
            </p>
          </div>
        )}
      </div>

      <CourseContentManager courseId={id} apiBase="/api/admin/members" uploadPath="/api/admin/members/upload" />
    </AdminPage>
  );
}
