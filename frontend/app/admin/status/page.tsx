"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

const I = ({ d, size = 16, color = "currentColor" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ic = {
  pulse: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  revenue: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  users: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  flag: "M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2z",
  check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  warn: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  crit: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  plus: "M12 4v16m8-8H4",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  refresh: "M4 4v5h5M20 20v-5h-5M5 13a7 7 0 0112.9-3.7M19 11a7 7 0 01-12.9 3.7",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
};

interface Milestone { id: string; category: string; targetValue: number; reached: boolean; reachedAt?: string; notified: boolean; }
interface Anomaly { type: string; message: string; }

export default function StatusPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [alertPhone, setAlertPhone] = useState("");
  const [alertName, setAlertName] = useState("");
  const [newCat, setNewCat] = useState("revenue");
  const [newVal, setNewVal] = useState("");
  const [checking, setChecking] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/admin/platform-status`, { headers: hdr() });
      const d = await res.json();
      setData(d);
      setAlertPhone(d.config?.alertPhone || "");
      setAlertName(d.config?.alertName || "");
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveConfig = async () => {
    await fetch(`${API}/api/admin/platform-config`, { method: "PATCH", headers: hdr(), body: JSON.stringify({ alertPhone, alertName }) });
    showToast("Configuração salva");
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

  const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Carregando estado da plataforma...</div>;
  if (!data) return <div style={{ padding: 40, textAlign: "center", color: "#ef4444" }}>Erro ao carregar</div>;

  const revMilestones: Milestone[] = (data.milestones || []).filter((m: Milestone) => m.category === "revenue");
  const subMilestones: Milestone[] = (data.milestones || []).filter((m: Milestone) => m.category === "subscribers");
  const anomalies: Anomaly[] = data.anomalies || [];

  const nextRev = revMilestones.find(m => !m.reached);
  const nextSub = subMilestones.find(m => !m.reached);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 500, letterSpacing: 1, textTransform: "uppercase" }}>Monitoramento</span>
          <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <I d={ic.activity} size={22} color="#f59e0b" /> Estado da Plataforma
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "none", color: "#aaa", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <I d={ic.refresh} size={14} /> Atualizar
          </button>
          <button onClick={forceCheck} disabled={checking} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0A0A0A", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, opacity: checking ? 0.7 : 1 }}>
            <I d={ic.flag} size={14} color="#0A0A0A" /> {checking ? "Verificando..." : "Verificar Metas"}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Faturamento Total", value: `${fmt(data.revenue.total)} MT`, sub: `${fmt(data.revenue.thisMonth)} MT este mês`, icon: ic.revenue, color: "#22c55e" },
          { label: "Assinantes (pagaram)", value: fmt(data.subscribers.total), sub: `${data.subscribers.active} ativos agora`, icon: ic.users, color: "#3b82f6" },
          { label: "Próx. Meta Faturamento", value: nextRev ? `${fmt(nextRev.targetValue)} MT` : "Todas batidas", sub: nextRev ? `Faltam ${fmt(nextRev.targetValue - data.revenue.total)} MT` : "—", icon: ic.flag, color: "#f59e0b" },
          { label: "Próx. Meta Assinantes", value: nextSub ? `${fmt(nextSub.targetValue)}` : "Todas batidas", sub: nextSub ? `Faltam ${fmt(nextSub.targetValue - data.subscribers.total)}` : "—", icon: ic.flag, color: "#a855f7" },
        ].map((c, i) => (
          <div key={i} className={styles.statCard} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "#888", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5 }}>{c.label}</span>
              <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${c.color}10` }}>
                <I d={c.icon} size={16} color={c.color} />
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#666" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Anomalies */}
      {anomalies.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <I d={ic.warn} size={16} color="#ef4444" /> Alertas & Anomalias
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {anomalies.map((a, i) => {
              const cfg = a.type === "critical" ? { bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.15)", color: "#ef4444", icon: ic.crit }
                : a.type === "warning" ? { bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)", color: "#f59e0b", icon: ic.warn }
                : { bg: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.15)", color: "#3b82f6", icon: ic.info };
              return (
                <div key={i} style={{ padding: "10px 14px", borderRadius: 8, background: cfg.bg, border: `1px solid ${cfg.border}`, display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: cfg.color }}>
                  <I d={cfg.icon} size={16} color={cfg.color} /> {a.message}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Milestones */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
        {[
          { title: "Faturamento", items: revMilestones, current: data.revenue.total, unit: "MT", color: "#22c55e" },
          { title: "Assinantes", items: subMilestones, current: data.subscribers.total, unit: "", color: "#3b82f6" },
        ].map((section, si) => (
          <div key={si} className={styles.statCard} style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <I d={si === 0 ? ic.revenue : ic.users} size={16} color={section.color} /> Metas de {section.title}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {section.items.map((m) => {
                const pct = Math.min((section.current / m.targetValue) * 100, 100);
                return (
                  <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <I d={m.reached ? ic.check : ic.flag} size={14} color={m.reached ? section.color : "#555"} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: m.reached ? "#fff" : "#888" }}>
                          {fmt(m.targetValue)} {section.unit}
                        </span>
                        {m.reached && m.reachedAt && (
                          <span style={{ fontSize: 10, color: "#666", marginLeft: 4 }}>
                            {new Date(m.reachedAt).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {m.reached && (
                          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${section.color}15`, color: section.color, fontWeight: 600 }}>Alcançada</span>
                        )}
                        <button onClick={() => deleteMilestone(m.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                          <I d={ic.trash} size={12} color="#555" />
                        </button>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: m.reached ? section.color : `${section.color}66`, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Config */}
      <div className={styles.statCard} style={{ padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <I d={ic.settings} size={16} color="#f59e0b" /> Configurações
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Alert recipient */}
          <div>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 500 }}>Destinatário de Alertas (WhatsApp)</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>Nome</label>
                <input className={styles.formInput} value={alertName} onChange={e => setAlertName(e.target.value)} placeholder="Ex: Angelo" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><I d={ic.phone} size={12} color="#666" /> Telefone</span>
                </label>
                <input className={styles.formInput} value={alertPhone} onChange={e => setAlertPhone(e.target.value)} placeholder="258841234567" />
              </div>
              <button onClick={saveConfig} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0A0A0A", fontWeight: 600, fontSize: 12, cursor: "pointer", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}>
                <I d={ic.check} size={13} color="#0A0A0A" /> Salvar
              </button>
            </div>
          </div>

          {/* Add milestone */}
          <div>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 10, fontWeight: 500 }}>Adicionar Meta</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>Categoria</label>
                <select className={styles.formInput} value={newCat} onChange={e => setNewCat(e.target.value)}>
                  <option value="revenue">Faturamento (MT)</option>
                  <option value="subscribers">Assinantes</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#666", display: "block", marginBottom: 3 }}>Valor da Meta</label>
                <input className={styles.formInput} type="number" min={1} value={newVal} onChange={e => setNewVal(e.target.value)} placeholder={newCat === "revenue" ? "Ex: 250000" : "Ex: 500"} />
              </div>
              <button onClick={addMilestone} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", background: "none", color: "#aaa", fontSize: 12, cursor: "pointer", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6 }}>
                <I d={ic.plus} size={13} /> Adicionar Meta
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200, padding: "12px 20px", borderRadius: 10,
          display: "flex", alignItems: "center", gap: 8, backdropFilter: "blur(12px)",
          background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.25)", color: "#2DD4BF", fontSize: 13, fontWeight: 500,
        }}><I d={ic.check} size={16} color="#2DD4BF" /> {toast}</div>
      )}
    </div>
  );
}
