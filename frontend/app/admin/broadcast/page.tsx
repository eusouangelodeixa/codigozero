"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

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
  const [segment, setSegment] = useState("all");
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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

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
        body: JSON.stringify({ segment, message }),
      })
        .then(r => r.json())
        .then(d => { setPreview(d.preview || message); setPreviewSample(d.sample || null); })
        .catch(() => {});
    }, 600);
  }, [message, segment]);

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

  const handleSend = async () => {
    if (!message.trim()) return showToast("❌ Escreva uma mensagem");
    if (!instanceId && !sendPush) return showToast("❌ Selecione uma instância WhatsApp ou ative Push");

    const segCount = segment === "all" ? counts.total : counts[segment] || 0;
    const channels = [instanceId ? 'WhatsApp' : '', sendPush ? 'Push' : ''].filter(Boolean).join(' + ');
    if (!confirm(`Enviar via ${channels} para ${segCount} leads?\n\nIntervalo: ${delayMin}s - ${delayMax}s entre cada envio.`)) return;

    setSending(true);
    setLog([]);
    setProgress(null);

    try {
      const res = await fetch(`${API}/api/admin/broadcast/send`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ segment, message, instanceId: instanceId || undefined, delayMin, delayMax, sendPush, generateCoupons, couponDiscount, couponMaxUses }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        showToast(`❌ ${err.error}`);
        setSending(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) { setSending(false); return; }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: SSEEvent = JSON.parse(line.slice(6));
              setProgress(event);
              setLog(prev => [...prev, event]);

              if (event.type === "complete") {
                showToast(`✅ Broadcast concluído! ${event.sent} enviados, ${event.failed} falhas.`);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      showToast(`❌ Erro de conexão: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const getSegmentCount = (id: string) => {
    if (id === "all") return counts.total || 0;
    return counts[id] || 0;
  };

  const progressPct = progress?.total ? Math.round(((progress.sent || 0) + (progress.failed || 0)) / progress.total * 100) : 0;

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>📡 Broadcast</h1>
        <p className={styles.pageDesc}>Disparo em massa via WhatsApp com personalização e anti-bloqueio</p>
      </div>

      {/* ── Audience Segments ── */}
      <div className={styles.kpiGrid}>
        {SEGMENTS.map(seg => (
          <button
            key={seg.id}
            className={styles.kpiCard}
            onClick={() => setSegment(seg.id)}
            style={{
              cursor: "pointer",
              borderColor: segment === seg.id ? "rgba(45,212,191,0.5)" : undefined,
              background: segment === seg.id ? "rgba(45,212,191,0.06)" : undefined,
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
              <span style={{ fontSize: "12px", color: "#f59e0b", marginTop: "4px", display: "block" }}>
                ⚠️ Nenhuma instância encontrada. Verifique a conexão com o Komunika nas Configurações.
              </span>
            )}
          </div>

          {/* Push Notification Option */}
          <div className={styles.formGroup} style={{ gridColumn: "1 / -1" }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              padding: "12px 16px", borderRadius: 8,
              background: sendPush ? "rgba(45,212,191,0.08)" : "rgba(255,255,255,0.02)",
              border: sendPush ? "1px solid rgba(45,212,191,0.3)" : "1px solid rgba(255,255,255,0.06)",
              transition: "all 0.2s",
            }}>
              <input type="checkbox" checked={sendPush} onChange={e => setSendPush(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#2DD4BF" }} />
              <div>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>🔔 Enviar Push Notification</span>
                <span style={{ display: "block", fontSize: 11, color: "#888", marginTop: 2 }}>
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
              background: generateCoupons ? "rgba(245,158,11,0.06)" : "rgba(255,255,255,0.02)",
              border: generateCoupons ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(255,255,255,0.06)",
              transition: "all 0.2s",
            }}>
              <input type="checkbox" checked={generateCoupons} onChange={e => setGenerateCoupons(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#f59e0b" }} />
              <div>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>🎟️ Gerar Cupom por Usuário</span>
                <span style={{ display: "block", fontSize: 11, color: "#888", marginTop: 2 }}>
                  Cria um cupom único para cada destinatário. Use <strong style={{ color: "#f59e0b" }}>{"{{cupom}}"}</strong> na mensagem.
                </span>
              </div>
            </label>
            {generateCoupons && (
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Desconto (%)</label>
                  <input className={styles.formInput} type="number" min={1} max={100}
                    value={couponDiscount} onChange={e => setCouponDiscount(Math.min(100, Math.max(1, parseInt(e.target.value) || 10)))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>Usos por cupom</label>
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
        <p style={{ fontSize: "12px", color: "#888", marginTop: "8px" }}>
          🛡️ Anti-bloqueio: o sistema vai variar aleatoriamente entre <strong style={{ color: "#2DD4BF" }}>{delayMin}s</strong> e <strong style={{ color: "#2DD4BF" }}>{delayMax}s</strong> de intervalo entre cada envio.
        </p>
      </div>

      {/* ── Message Editor ── */}
      <div className={styles.card}>
        <h3 className={styles.cardTitle}>✍️ Mensagem</h3>

        {/* Full-width textarea */}
        <div style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <label className={styles.formLabel} style={{ marginBottom: 0 }}>Conteúdo da mensagem</label>
            <span style={{ fontSize: "11px", color: "#555" }}>Clique nas variáveis para inserir ↓</span>
          </div>

          {/* Variable chips — compact inline row */}
          <div style={{
            display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px",
            padding: "8px 10px", borderRadius: "8px 8px 0 0",
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderBottom: "none",
          }}>
            {variables.map(v => (
              <button
                key={v.key}
                onClick={() => insertVariable(v.key)}
                style={{
                  padding: "3px 8px", fontSize: "11px", borderRadius: "4px",
                  background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.15)",
                  color: "#2DD4BF", cursor: "pointer", fontFamily: "monospace",
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
                <span style={{ fontSize: "11px", color: "#888" }}>
                  Exemplo para: <strong style={{ color: "#2DD4BF" }}>{previewSample.name}</strong> ({previewSample.phone})
                </span>
              )}
            </div>
            <div style={{
              padding: "16px 20px", borderRadius: "8px",
              background: "#0d1117", border: "1px solid rgba(255,255,255,0.06)",
              fontSize: "13px", color: "#ddd", lineHeight: "1.7", whiteSpace: "pre-wrap",
              maxHeight: "240px", overflow: "auto",
            }}>
              {preview || <span style={{ color: "#555" }}>Carregando preview...</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Send Button ── */}
      <div className={styles.btnRow}>
        <button
          className={styles.btnPrimary}
          onClick={handleSend}
          disabled={sending || !message.trim() || (!instanceId && !sendPush)}
          style={{ opacity: sending ? 0.7 : 1 }}
        >
          {sending ? "⏳ Enviando..." : `🚀 Disparar para ${getSegmentCount(segment)} leads`}
        </button>
      </div>

      {/* ── Progress & Log ── */}
      {(sending || log.length > 0) && (
        <div className={styles.card} style={{ marginTop: "16px" }}>
          <h3 className={styles.cardTitle}>📊 Progresso do Envio</h3>

          {/* Progress bar */}
          {progress && progress.total && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "#888", marginBottom: "6px" }}>
                <span>
                  {progress.type === "complete" ? "✅ Concluído" : progress.type === "waiting" ? `⏱️ Próximo em ${progress.delay}s...` : `Enviando...`}
                </span>
                <span>{(progress.sent || 0) + (progress.failed || 0)} / {progress.total}</span>
              </div>
              <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                <div style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  borderRadius: "3px",
                  background: progress.type === "complete" ? "#22c55e" : "#2DD4BF",
                  transition: "width 0.3s ease",
                }} />
              </div>
              <div style={{ display: "flex", gap: "24px", marginTop: "8px", fontSize: "12px" }}>
                <span style={{ color: "#22c55e" }}>✅ Enviados: {progress.sent || 0}</span>
                <span style={{ color: "#ef4444" }}>❌ Falhas: {progress.failed || 0}</span>
                <span style={{ color: "#888" }}>⏳ Pendentes: {(progress.total || 0) - (progress.sent || 0) - (progress.failed || 0)}</span>
              </div>
            </div>
          )}

          {/* Event log */}
          <div
            ref={logRef}
            style={{
              maxHeight: "240px", overflow: "auto", background: "#0a0a0a",
              borderRadius: "8px", padding: "12px", fontSize: "12px",
              fontFamily: "monospace", lineHeight: "1.8",
            }}
          >
            {log.map((evt, i) => (
              <div key={i} style={{ color: evt.type === "sent" ? "#22c55e" : evt.type === "error" || evt.type === "skip" ? "#ef4444" : evt.type === "waiting" ? "#888" : evt.type === "complete" ? "#2DD4BF" : "#aaa" }}>
                {evt.type === "start" && `[START] Iniciando envio para ${evt.total} leads...`}
                {evt.type === "sent" && `[✓] ${evt.name} — ${evt.phone}`}
                {evt.type === "error" && `[✗] ${evt.name} — ${evt.error}`}
                {evt.type === "skip" && `[SKIP] ${evt.name} — ${evt.reason}`}
                {evt.type === "waiting" && `[...] Aguardando ${evt.delay}s antes do próximo envio`}
                {evt.type === "complete" && `[DONE] Broadcast concluído. ✅ ${evt.sent} enviados, ❌ ${evt.failed} falhas.`}
                {evt.type === "fatal" && `[FATAL] ${evt.error}`}
              </div>
            ))}
            {sending && log.length === 0 && <div style={{ color: "#888" }}>Conectando ao servidor...</div>}
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
