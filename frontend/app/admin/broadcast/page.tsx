"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import styles from "../admin.module.css";
import DateRangeFilter, { DateRange } from "@/components/admin/DateRangeFilter";
import { AdminPage } from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo", grace_period: "Carência", overdue: "Atrasado", canceled: "Cancelado", lead: "Lead",
};

/** Convert a DateRange chip into ISO {from, to} for the broadcast payload. */
function dateWindow(range: DateRange): { from?: string; to?: string } {
  const now = new Date();
  if (range.period === "today") {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }
  if (range.period === "7d") {
    const start = new Date(now); start.setDate(now.getDate() - 7);
    return { from: start.toISOString() };
  }
  if (range.period === "30d") {
    const start = new Date(now); start.setDate(now.getDate() - 30);
    return { from: start.toISOString() };
  }
  if (range.period === "custom") return { from: range.from, to: range.to };
  return {};
}

interface Variable { key: string; label: string; field: string }
interface Instance { id: string; name: string; status?: string; instanceName?: string }
interface SSEEvent { type: string; total?: number; sent?: number; failed?: number; name?: string; phone?: string; delay?: number; error?: string; reason?: string; index?: number; nextIndex?: number }

const SEGMENTS = [
  { id: "active",   label: "Clientes Ativos",     icon: "👥", desc: "Assinatura ativa" },
  { id: "inactive", label: "Clientes Inativos",    icon: "🔒", desc: "Expirada / Cancelada" },
  { id: "visitors", label: "Visitantes",           icon: "👀", desc: "Não compraram" },
  { id: "all",      label: "Todos os Leads",       icon: "📋", desc: "Sem filtro" },
];

export default function BroadcastPage() {
  const [audienceMode, setAudienceMode] = useState<"segment" | "users">("segment");
  const [segment, setSegment] = useState("all");
  const [range, setRange] = useState<DateRange>({ period: "all" });
  // Specific-user picker
  const [userQuery, setUserQuery] = useState("");
  const [userStatus, setUserStatus] = useState("all");
  const [userList, setUserList] = useState<any[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [pickedUsers, setPickedUsers] = useState<Record<string, { name: string; phone: string }>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [variables, setVariables] = useState<Variable[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceId, setInstanceId] = useState("");
  const [message, setMessage] = useState("");
  const [delayMin, setDelayMin] = useState(5);
  const [delayMax, setDelayMax] = useState(15);
  const [preview, setPreview] = useState("");
  const [previewSample, setPreviewSample] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [sendPush, setSendPush] = useState(false);
  const [generateCoupons, setGenerateCoupons] = useState(false);
  const [couponDiscount, setCouponDiscount] = useState(10);
  const [couponMaxUses, setCouponMaxUses] = useState(1);
  const [progress, setProgress] = useState<SSEEvent | null>(null);
  const [log, setLog] = useState<SSEEvent[]>([]);
  const [toast, setToast] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<any>(null);
  const completedRef = useRef(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const JOB_KEY = "cz_broadcast_job";

  // Apply a polled job state to the UI. The job log events carry the same
  // shape as the live progress, so the last entry drives the progress bar.
  const applyJob = useCallback((job: any) => {
    if (!job) return;
    const evts: SSEEvent[] = job.log || [];
    setLog(evts);
    setProgress(evts.length ? evts[evts.length - 1] : { type: "start", total: job.total, sent: 0, failed: 0 });

    if ((job.status === "done" || job.status === "error") && !completedRef.current) {
      completedRef.current = true;
      if (job.status === "error") {
        showToast(`❌ Broadcast falhou: ${job.error || "erro desconhecido"}`);
      } else {
        const couponMsg = job.coupons ? ` 🎟️ ${job.coupons} cupons.` : "";
        showToast(`✅ Broadcast concluído! ${job.sent} enviados, ${job.failed} falhas.${couponMsg}`);
      }
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Poll a background job until it finishes. Survives navigating away/back
  // because the work runs server-side; we just re-read its state.
  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    completedRef.current = false;
    setSending(true);
    localStorage.setItem(JOB_KEY, jobId);

    const tick = async () => {
      try {
        const r = await fetch(`${API}/api/admin/broadcast/status/${jobId}`, { headers: hdr() });
        if (r.status === 404) { stopPolling(); setSending(false); localStorage.removeItem(JOB_KEY); return; }
        const job = await r.json();
        applyJob(job);
        if (job.status === "done" || job.status === "error") {
          stopPolling();
          setSending(false);
          localStorage.removeItem(JOB_KEY);
        }
      } catch { /* transient network error — keep polling */ }
    };

    tick();
    pollRef.current = setInterval(tick, 1500);
  }, [applyJob, stopPolling]);

  // Reattach to an in-progress broadcast when the page (re)mounts.
  useEffect(() => {
    const stored = localStorage.getItem(JOB_KEY);
    if (stored) { startPolling(stored); return; }
    fetch(`${API}/api/admin/broadcast/active`, { headers: hdr() })
      .then(r => r.json())
      .then(d => { if (d?.job?.id) startPolling(d.job.id); })
      .catch(() => {});
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Load audience & instances on mount
  useEffect(() => {
    fetch(`${API}/api/admin/broadcast/audience`, { headers: hdr() })
      .then(r => r.json())
      .then(d => {
        setCounts(d.segments || {});
        setVariables(d.variables || []);
      })
      .catch(() => {});

    fetch(`${API}/api/admin/broadcast/instances`, { headers: hdr() })
      .then(r => r.json())
      .then(d => setInstances(d.instances || []))
      .catch(() => {});
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // Preview debounce
  const previewTimeout = useRef<any>(null);
  useEffect(() => {
    if (!message.trim()) { setPreview(""); setPreviewSample(null); return; }
    clearTimeout(previewTimeout.current);
    previewTimeout.current = setTimeout(() => {
      fetch(`${API}/api/admin/broadcast/preview`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ ...audiencePayload(), message }),
      })
        .then(r => r.json())
        .then(d => { setPreview(d.preview || message); setPreviewSample(d.sample || null); })
        .catch(() => {});
    }, 600);
  }, [message, segment, audienceMode, range, pickedUsers]);

  // Load the searchable user list when picking specific recipients.
  useEffect(() => {
    if (audienceMode !== "users") return;
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (userQuery) params.set("search", userQuery);
      if (userStatus !== "all") params.set("status", userStatus);
      fetch(`${API}/api/admin/broadcast/users?${params}`, { headers: hdr() })
        .then((r) => r.json())
        .then((d) => { setUserList(d.users || []); setUserTotal(d.total || 0); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [audienceMode, userQuery, userStatus]);

  const insertVariable = useCallback((key: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newMsg = message.slice(0, start) + key + message.slice(end);
    setMessage(newMsg);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + key.length, start + key.length);
    }, 0);
  }, [message]);

  const getSegmentCount = (id: string) => {
    if (id === "all") return counts.total || 0;
    return counts[id] || 0;
  };

  // Build the audience portion of the request from the active mode.
  const audiencePayload = useCallback(() => {
    if (audienceMode === "users") {
      return { userIds: Object.keys(pickedUsers) };
    }
    const payload: any = { segment };
    if (range.period !== "all") {
      const win = dateWindow(range);
      if (win.from) payload.createdFrom = win.from;
      if (win.to) payload.createdTo = win.to;
    }
    return payload;
  }, [audienceMode, pickedUsers, segment, range]);

  // Recipient count for the confirm dialog / button. Exact for the user
  // picker; for segments it's the segment total (a date filter narrows it
  // server-side, so the real send may be smaller).
  const recipientCount = audienceMode === "users"
    ? Object.keys(pickedUsers).length
    : getSegmentCount(segment);

  const handleSend = async () => {
    if (!message.trim()) return showToast("❌ Escreva uma mensagem");
    if (!instanceId && !sendPush) return showToast("❌ Selecione uma instância WhatsApp ou ative Push");
    if (audienceMode === "users" && Object.keys(pickedUsers).length === 0) {
      return showToast("❌ Selecione ao menos um usuário");
    }

    const channels = [instanceId ? 'WhatsApp' : '', sendPush ? 'Push' : ''].filter(Boolean).join(' + ');
    const countLabel = audienceMode === "segment" && range.period !== "all" ? `até ${recipientCount}` : `${recipientCount}`;
    if (!confirm(`Enviar via ${channels} para ${countLabel} destinatário(s)?\n\nIntervalo: ${delayMin}s - ${delayMax}s entre cada envio.`)) return;

    setSending(true);
    setLog([]);
    setProgress(null);
    completedRef.current = false;

    try {
      const res = await fetch(`${API}/api/admin/broadcast/send`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ ...audiencePayload(), message, instanceId: instanceId || undefined, delayMin, delayMax, sendPush, generateCoupons, couponDiscount, couponMaxUses }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        showToast(`❌ ${err.error}`);
        setSending(false);
        return;
      }

      const { jobId } = await res.json();
      if (!jobId) { showToast("❌ Não foi possível iniciar o disparo"); setSending(false); return; }

      // The disparo now runs server-side; we just poll its progress. Closing
      // this tab or navigating away no longer stops it.
      showToast("🚀 Disparo iniciado — pode navegar à vontade, continua em segundo plano.");
      startPolling(jobId);
    } catch (err: any) {
      showToast(`❌ Erro de conexão: ${err.message}`);
      setSending(false);
    }
  };

  const togglePick = (u: any) =>
    setPickedUsers((prev) => {
      const next = { ...prev };
      if (next[u.id]) delete next[u.id];
      else next[u.id] = { name: u.name, phone: u.phone };
      return next;
    });
  const pickAllVisible = () =>
    setPickedUsers((prev) => {
      const next = { ...prev };
      userList.forEach((u) => { next[u.id] = { name: u.name, phone: u.phone }; });
      return next;
    });
  const clearPicks = () => setPickedUsers({});

  const progressPct = progress?.total ? Math.round(((progress.sent || 0) + (progress.failed || 0)) / progress.total * 100) : 0;

  return (
    <>
      <AdminPage title="Broadcast">

      {/* ── Audience ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>🎯 Público-alvo</h3>

        <div className={styles.tableToolbar} style={{ padding: 0, border: "none", background: "none", marginBottom: 12 }}>
          <button
            className={`${styles.filterBtn} ${audienceMode === "segment" ? styles.filterBtnActive : ""}`}
            onClick={() => setAudienceMode("segment")}
          >
            Por segmento
          </button>
          <button
            className={`${styles.filterBtn} ${audienceMode === "users" ? styles.filterBtnActive : ""}`}
            onClick={() => setAudienceMode("users")}
          >
            Selecionar usuários
          </button>
        </div>

        {audienceMode === "segment" ? (
          <>
            <div className={styles.kpiGrid}>
              {SEGMENTS.map((seg) => (
                <button
                  key={seg.id}
                  className={styles.kpiCard}
                  onClick={() => setSegment(seg.id)}
                  style={{
                    cursor: "pointer",
                    borderColor: segment === seg.id ? "var(--accent-border)" : undefined,
                    background: segment === seg.id ? "var(--accent-glow)" : undefined,
                  }}
                >
                  <div className={styles.kpiLabel}>{seg.icon} {seg.desc}</div>
                  <div className={`${styles.kpiValue} ${segment === seg.id ? styles.kpiValueTeal : ""}`}>
                    {getSegmentCount(seg.id)}
                  </div>
                  <div className={styles.kpiSub}>{seg.label}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              <label className={styles.formLabel} style={{ marginBottom: 0 }}>Filtrar por data de cadastro</label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
          </>
        ) : (
          <>
            <div className={styles.tableToolbar} style={{ padding: 0, border: "none", background: "none" }}>
              <input
                className={styles.tableSearch}
                placeholder="Buscar usuário por nome, email ou telefone..."
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
              />
              <select className={styles.formSelect} style={{ maxWidth: 170 }} value={userStatus} onChange={(e) => setUserStatus(e.target.value)}>
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="grace_period">Carência</option>
                <option value="overdue">Atrasados</option>
                <option value="canceled">Cancelados</option>
                <option value="lead">Leads</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "8px 0", fontSize: 12, color: "var(--text-secondary)" }}>
              <span>
                <strong style={{ color: "var(--accent)" }}>{Object.keys(pickedUsers).length}</strong> selecionado(s)
                {userTotal > userList.length ? ` · mostrando ${userList.length} de ${userTotal}` : ""}
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                <button className={styles.filterBtn} onClick={pickAllVisible}>Selecionar visíveis</button>
                <button className={styles.filterBtn} onClick={clearPicks}>Limpar</button>
              </span>
            </div>
            <div style={{ maxHeight: 320, overflow: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {userList.length === 0 ? (
                <div className={styles.empty}>Nenhum usuário encontrado</div>
              ) : userList.map((u) => {
                const picked = !!pickedUsers[u.id];
                return (
                  <label
                    key={u.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                      background: picked ? "var(--accent-glow)" : "var(--bg-glass)",
                      border: picked ? "1px solid var(--accent-border)" : "1px solid var(--border-glass)",
                    }}
                  >
                    <input type="checkbox" checked={picked} onChange={() => togglePick(u)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace" }}>{u.phone}</span>
                    <span className={`${styles.badge} ${styles.badgeGray}`}>{STATUS_LABEL[u.subscriptionStatus] || u.subscriptionStatus}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Instance + Delay Config ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>⚙️ Configuração de Envio</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.formLabel}>Instância WhatsApp (Komunika)</label>
            <select
              className={styles.formInput}
              value={instanceId}
              onChange={e => setInstanceId(e.target.value)}
            >
              <option value="">-- Selecione uma instância --</option>
              {instances.map((inst: any) => (
                <option key={inst.id || inst.instanceName} value={inst.id || inst.instanceName}>
                  {inst.name || inst.instanceName || inst.id} {inst.status ? `(${inst.status})` : ""}
                </option>
              ))}
            </select>
            {instances.length === 0 && (
              <span style={{ fontSize: "12px", color: "var(--color-warning)", marginTop: "4px", display: "block" }}>
                ⚠️ Nenhuma instância encontrada. Verifique a conexão com o Komunika nas Configurações.
              </span>
            )}
          </div>

          {/* Push Notification Option */}
          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "12px 16px", borderRadius: 8,
              background: sendPush ? "var(--accent-glow)" : "var(--bg-glass)",
              border: sendPush ? "1px solid var(--accent-border)" : "1px solid var(--border-glass)",
              transition: "all 0.2s",
            }}>
              <input type="checkbox" checked={sendPush} onChange={e => setSendPush(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--accent)" }} />
              <div>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>🔔 Enviar Push Notification</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Envia notificação no app para todos os alunos (ativos e inativos)
                </span>
              </div>
            </label>
          </div>

          {/* Coupon Generation Option */}
          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "12px 16px", borderRadius: 8,
              background: generateCoupons ? "rgba(245,158,11,0.06)" : "var(--bg-glass)",
              border: generateCoupons ? "1px solid rgba(245,158,11,0.25)" : "1px solid var(--border-glass)",
              transition: "all 0.2s",
            }}>
              <input type="checkbox" checked={generateCoupons} onChange={e => setGenerateCoupons(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "var(--color-warning)" }} />
              <div>
                <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>🎟️ Gerar Cupom por Usuário</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                  Cria um cupom único para cada destinatário. Use <strong style={{ color: "var(--color-warning)" }}>{"{{cupom}}"}</strong> na mensagem.
                </span>
              </div>
            </label>
            {generateCoupons && (
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Desconto (%)</label>
                  <input className={styles.formInput} type="number" min={1} max={100}
                    value={couponDiscount} onChange={e => setCouponDiscount(Math.min(100, Math.max(1, parseInt(e.target.value) || 10)))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>Usos por cupom</label>
                  <input className={styles.formInput} type="number" min={1} max={10}
                    value={couponMaxUses} onChange={e => setCouponMaxUses(Math.min(10, Math.max(1, parseInt(e.target.value) || 1)))} />
                </div>
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Intervalo Mínimo (segundos)</label>
            <input
              className={styles.formInput}
              type="number"
              min={1}
              value={delayMin}
              onChange={e => setDelayMin(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Intervalo Máximo (segundos)</label>
            <input
              className={styles.formInput}
              type="number"
              min={delayMin}
              value={delayMax}
              onChange={e => setDelayMax(Math.max(delayMin, parseInt(e.target.value) || delayMin))}
            />
          </div>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
          🛡️ Anti-bloqueio: o sistema vai variar aleatoriamente entre <strong style={{ color: "var(--accent)" }}>{delayMin}s</strong> e <strong style={{ color: "var(--accent)" }}>{delayMax}s</strong> de intervalo entre cada envio.
        </p>
      </div>

      {/* ── Message Editor ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>✍️ Mensagem</h3>

        {/* Full-width textarea */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label className={styles.formLabel} style={{ marginBottom: 0 }}>Conteúdo da mensagem</label>
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Clique nas variáveis para inserir ↓</span>
          </div>

          {/* Variable chips — compact inline row */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px",
            padding: "8px 10px", borderRadius: "8px 8px 0 0",
            background: "var(--bg-glass)", border: "1px solid var(--border-glass)",
            borderBottom: "none",
          }}>
            {variables.map(v => (
              <button
                key={v.key}
                onClick={() => insertVariable(v.key)}
                style={{
                  padding: "3px 8px", fontSize: "11px", borderRadius: "4px",
                  background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.15)",
                  color: "var(--accent)", cursor: "pointer", fontFamily: "monospace",
                  transition: "all 0.12s ease", lineHeight: "1.4",
                }}
                onMouseOver={e => { e.currentTarget.style.background = "rgba(45,212,191,0.2)"; e.currentTarget.style.borderColor = "rgba(45,212,191,0.4)"; }}
                onMouseOut={e => { e.currentTarget.style.background = "rgba(45,212,191,0.1)"; e.currentTarget.style.borderColor = "rgba(45,212,191,0.15)"; }}
                title={v.label}
              >
                {v.key}
              </button>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            className={styles.formInput}
            style={{
              width: "100%", height: "360px", resize: "vertical",
              fontFamily: "monospace", fontSize: "13px", lineHeight: "1.7",
              borderRadius: "0 0 8px 8px", borderTop: "none",
            }}
            placeholder={`Olá {{nome}}! 👋\n\nVi que o seu objetivo é {{objetivo}}.\nComo está a sua jornada?\n\nÉ que temos novidades incríveis no Código Zero que vão te ajudar a superar {{dor}}.\n\nVamos conversar?`}
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
        </div>

        {/* Preview — full width below */}
        {(preview || message.trim()) && (
          <div style={{ marginTop: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <label className={styles.formLabel} style={{ marginBottom: 0 }}>
                👁️ Preview
              </label>
              {previewSample && (
                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                  Exemplo para: <strong style={{ color: "var(--accent)" }}>{previewSample.name}</strong> ({previewSample.phone})
                </span>
              )}
            </div>
            <div style={{
              padding: "16px 20px", borderRadius: "8px",
              background: "var(--bg-base)", border: "1px solid var(--border-glass)",
              fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.7", whiteSpace: "pre-wrap",
              maxHeight: "240px", overflow: "auto",
            }}>
              {preview || <span style={{ color: "var(--text-tertiary)" }}>Carregando preview...</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Send Button ── */}
      <div className={styles.btnRow}>
        <button
          className={styles.btnPrimary}
          onClick={handleSend}
          disabled={sending || !message.trim() || (!instanceId && !sendPush) || (audienceMode === "users" && recipientCount === 0)}
          style={{ opacity: sending ? 0.7 : 1 }}
        >
          {sending
            ? "⏳ Enviando..."
            : `🚀 Disparar para ${audienceMode === "segment" && range.period !== "all" ? "até " : ""}${recipientCount} ${audienceMode === "users" ? "usuário(s)" : "leads"}`}
        </button>
      </div>

      {/* ── Progress & Log ── */}
      {(sending || log.length > 0) && (
        <div className={styles.card} style={{ marginTop: "16px" }}>
          <h3 className={styles.cardTitle}>📊 Progresso do Envio</h3>

          {/* Progress bar */}
          {progress && progress.total && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--text-secondary)", marginBottom: "6px" }}>
                <span>
                  {progress.type === "complete" ? "✅ Concluído" : progress.type === "waiting" ? `⏱️ Próximo em ${progress.delay}s...` : `Enviando...`}
                </span>
                <span>{(progress.sent || 0) + (progress.failed || 0)} / {progress.total}</span>
              </div>
              <div style={{ height: "6px", borderRadius: "3px", background: "var(--border-glass)", overflow: "hidden" }}>
                <div style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  borderRadius: "3px",
                  background: progress.type === "complete" ? "var(--color-success)" : "var(--accent)",
                  transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{ display: "flex", gap: "24px", marginTop: "8px", fontSize: "12px" }}>
                <span style={{ color: "var(--color-success)" }}>✅ Enviados: {progress.sent || 0}</span>
                <span style={{ color: "var(--color-error)" }}>❌ Falhas: {progress.failed || 0}</span>
                <span style={{ color: "var(--text-secondary)" }}>⏳ Pendentes: {(progress.total || 0) - (progress.sent || 0) - (progress.failed || 0)}</span>
              </div>
            </div>
          )}

          {/* Event log */}
          <div
            ref={logRef}
            style={{
              maxHeight: "240px", overflow: "auto", background: "var(--bg-base)",
              borderRadius: "8px", padding: "12px", fontSize: "12px",
              fontFamily: "monospace", lineHeight: "1.8",
            }}
          >
            {log.map((evt, i) => (
              <div key={i} style={{ color: evt.type === "sent" || evt.type === "coupon" ? "var(--color-success)" : evt.type === "error" || evt.type === "skip" || evt.type === "coupon_error" || evt.type === "fatal" ? "var(--color-error)" : evt.type === "waiting" ? "var(--text-secondary)" : evt.type === "complete" ? "var(--accent)" : "var(--text-secondary)" }}>
                {evt.type === "start" && `[START] Iniciando envio para ${evt.total} leads...`}
                {evt.type === "sent" && `[✓] ${evt.name} — ${evt.phone}`}
                {evt.type === "error" && `[✗] ${evt.name} — ${evt.error}`}
                {evt.type === "skip" && `[SKIP] ${evt.name} — ${evt.reason}`}
                {evt.type === "coupon" && `[🎟️] Cupom ${(evt as any).code} criado para ${evt.name}`}
                {evt.type === "coupon_error" && `[🎟️✗] Falha no cupom ${(evt as any).code} (${evt.name}) — ${evt.error}`}
                {evt.type === "waiting" && `[...] Aguardando ${evt.delay}s antes do próximo envio`}
                {evt.type === "complete" && `[DONE] Broadcast concluído. ✅ ${evt.sent} enviados, ❌ ${evt.failed} falhas.`}
                {evt.type === "fatal" && `[FATAL] ${evt.error}`}
              </div>
            ))}
            {sending && log.length === 0 && <div style={{ color: "var(--text-secondary)" }}>Conectando ao servidor...</div>}
          </div>
        </div>
      )}

      </AdminPage>
      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
