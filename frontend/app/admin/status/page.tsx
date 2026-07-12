"use client";
import { useState, useEffect, useCallback, type CSSProperties } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import { AdminPage, StatRow, StatTile, StatusBadge, Section } from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Milestone {
  id: string;
  category: string; // "revenue" | "subscribers"
  targetValue: number;
  reached: boolean;
  reachedAt?: string | null;
  notified: boolean;
}
interface Anomaly { type: string; message: string }
interface PlatformStatus {
  revenue: { total: number; thisMonth: number };
  subscribers: { total: number; active: number };
  milestones: Milestone[];
  anomalies: Anomaly[];
  config: { alertPhone: string; alertName: string };
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const anomalyColor = (type: string) =>
  type === "critical" ? "var(--color-error)" : type === "warning" ? "var(--color-warning)" : "var(--color-info)";

const panel: CSSProperties = {
  background: "var(--bg-glass)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-lg)",
  padding: "var(--card-padding)",
};
const panelTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-tertiary)",
  margin: "0 0 var(--space-4)",
};

export default function StatusPage() {
  const [data, setData] = useState<PlatformStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [alertPhone, setAlertPhone] = useState("");
  const [alertName, setAlertName] = useState("");
  const [newCat, setNewCat] = useState("revenue");
  const [newVal, setNewVal] = useState("");
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/platform-status`, { headers: hdr() });
      const d: PlatformStatus = await res.json();
      setData(d);
      setAlertPhone(d.config?.alertPhone || "");
      setAlertName(d.config?.alertName || "");
    } catch {
      showToast("Falha ao carregar o estado da plataforma");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveConfig = async () => {
    await fetch(`${API}/api/admin/platform-config`, { method: "PATCH", headers: hdr(), body: JSON.stringify({ alertPhone, alertName }) });
    showToast("Configuração salva");
  };

  const testAlert = async () => {
    setTesting(true);
    try {
      // Save first so the test hits the number currently in the field.
      await fetch(`${API}/api/admin/platform-config`, { method: "PATCH", headers: hdr(), body: JSON.stringify({ alertPhone, alertName }) });
      const res = await fetch(`${API}/api/admin/platform-test-alert`, { method: "POST", headers: hdr(), body: JSON.stringify({ phone: alertPhone }) });
      const d = await res.json();
      showToast(res.ok ? (d.message || "Teste enviado ✓") : `Falha: ${d.error || "erro"}`);
    } catch {
      showToast("Erro de conexão ao testar");
    }
    setTesting(false);
  };

  const addMilestone = async () => {
    if (!newVal || parseFloat(newVal) <= 0) return;
    await fetch(`${API}/api/admin/platform-config`, { method: "PATCH", headers: hdr(), body: JSON.stringify({ newMilestone: { category: newCat, targetValue: parseFloat(newVal) } }) });
    setNewVal("");
    load();
    showToast("Meta adicionada");
  };

  const deleteMilestone = async (id: string) => {
    await fetch(`${API}/api/admin/platform-milestone/${id}`, { method: "DELETE", headers: hdr() });
    load();
  };

  const forceCheck = async () => {
    setChecking(true);
    const res = await fetch(`${API}/api/admin/platform-check-milestones`, { method: "POST", headers: hdr() });
    const d = await res.json();
    showToast(d.newlyReached > 0 ? `${d.newlyReached} meta(s) batida(s)!` : "Nenhuma meta nova batida");
    load();
    setChecking(false);
  };

  const milestones = data?.milestones ?? [];
  const anomalies = data?.anomalies ?? [];
  const metaPanels = data
    ? [
        { title: "Faturamento", items: milestones.filter((m) => m.category === "revenue"), current: data.revenue.total, unit: "MT" },
        { title: "Assinantes", items: milestones.filter((m) => m.category === "subscribers"), current: data.subscribers.total, unit: "" },
      ]
    : [];

  return (
    <>
      <AdminPage
        title="Plataforma"
        actions={
          <>
            <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={load} disabled={loading}>
              Atualizar
            </button>
            <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={forceCheck} disabled={checking}>
              {checking ? "Verificando…" : "Verificar metas"}
            </button>
          </>
        }
        kpis={
          <StatRow>
            <StatTile accent label="Faturamento total" loading={!data} value={data && `${fmt(data.revenue.total)} MT`} />
            <StatTile label="Faturamento (mês)" loading={!data} value={data && `${fmt(data.revenue.thisMonth)} MT`} />
            <StatTile label="Assinantes" loading={!data} value={data && fmt(data.subscribers.total)} />
            <StatTile label="Ativos" loading={!data} value={data && fmt(data.subscribers.active)} />
          </StatRow>
        }
      >
        {!data ? (
          <div style={{ padding: "var(--space-10)", textAlign: "center", color: loading ? "var(--text-tertiary)" : "var(--color-error)", fontSize: "var(--type-small)" }}>
            {loading ? "Carregando estado da plataforma…" : "Erro ao carregar"}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {/* Alertas & anomalias */}
            {anomalies.length > 0 && (
              <div style={panel}>
                <h3 style={panelTitle}>Alertas & anomalias</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {anomalies.map((an, i) => {
                    const col = anomalyColor(an.type);
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          borderRadius: "var(--radius-md)",
                          fontSize: 13,
                          color: col,
                          background: `color-mix(in srgb, ${col} 8%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${col} 22%, transparent)`,
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: col, flexShrink: 0 }} />
                        {an.message}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Metas — barras de progresso */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--grid-gap)" }}>
              {metaPanels.map((p) => (
                <div key={p.title} style={panel}>
                  <h3 style={panelTitle}>Metas de {p.title}</h3>
                  {p.items.length === 0 ? (
                    <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: 0 }}>Nenhuma meta definida.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                      {p.items.map((m) => {
                        const pct = m.targetValue > 0 ? Math.min((p.current / m.targetValue) * 100, 100) : 0;
                        return (
                          <div key={m.id}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: m.reached ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                {fmt(m.targetValue)}{p.unit ? ` ${p.unit}` : ""}
                                {m.reached && m.reachedAt && (
                                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "var(--text-tertiary)" }}>
                                    {new Date(m.reachedAt).toLocaleDateString("pt-BR")}
                                  </span>
                                )}
                              </span>
                              {m.reached ? (
                                <StatusBadge tone="good" noDot>Alcançada</StatusBadge>
                              ) : (
                                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>{Math.floor(pct)}%</span>
                              )}
                            </div>
                            <div style={{ height: 6, borderRadius: "var(--radius-full)", background: "var(--bg-glass)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
                              <div
                                style={{
                                  height: "100%",
                                  width: `${pct}%`,
                                  borderRadius: "var(--radius-full)",
                                  background: m.reached ? "var(--accent)" : "color-mix(in srgb, var(--accent) 45%, transparent)",
                                  transition: "width .5s var(--ease-out)",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Configuração — colapsável (alerta WhatsApp + add/excluir meta) */}
            <Section title="Configuração e metas" defaultOpen={false}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "var(--space-6)" }}>
                {/* Destinatário de alertas */}
                <div>
                  <p style={panelTitle}>Alertas no WhatsApp</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div className={a.formGroup}>
                      <label className={a.formLabel}>Nome</label>
                      <input className={a.formInput} value={alertName} onChange={(e) => setAlertName(e.target.value)} placeholder="Ex: Angelo" />
                    </div>
                    <div className={a.formGroup}>
                      <label className={a.formLabel}>Telefone</label>
                      <input className={a.formInput} value={alertPhone} onChange={(e) => setAlertPhone(e.target.value)} placeholder="258841234567" />
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={saveConfig}>Salvar</button>
                      <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={testAlert} disabled={testing || !alertPhone}>
                        {testing ? "Enviando…" : "Testar WhatsApp"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Adicionar / excluir meta */}
                <div>
                  <p style={panelTitle}>Metas</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div className={a.formGroup}>
                      <label className={a.formLabel}>Categoria</label>
                      <select className={a.formSelect} value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                        <option value="revenue">Faturamento (MT)</option>
                        <option value="subscribers">Assinantes</option>
                      </select>
                    </div>
                    <div className={a.formGroup}>
                      <label className={a.formLabel}>Valor da meta</label>
                      <input
                        className={a.formInput}
                        type="number"
                        min={1}
                        value={newVal}
                        onChange={(e) => setNewVal(e.target.value)}
                        placeholder={newCat === "revenue" ? "Ex: 250000" : "Ex: 500"}
                      />
                    </div>
                    <button type="button" className={`${k.btn} ${k.btnSecondary}`} style={{ alignSelf: "flex-start" }} onClick={addMilestone}>
                      ＋ Adicionar meta
                    </button>
                  </div>

                  {milestones.length > 0 && (
                    <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column" }}>
                      {milestones.map((m) => (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                            {m.category === "revenue" ? "Faturamento" : "Assinantes"} · {fmt(m.targetValue)}{m.category === "revenue" ? " MT" : ""}
                            {m.reached && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--color-success)" }}>✓ alcançada</span>}
                          </span>
                          <button
                            type="button"
                            onClick={() => deleteMilestone(m.id)}
                            style={{ background: "transparent", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: 12, padding: "2px 6px", borderRadius: "var(--radius-sm)" }}
                          >
                            Excluir
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Section>
          </div>
        )}
      </AdminPage>

      {toast && <div className={a.toast}>{toast}</div>}
    </>
  );
}
