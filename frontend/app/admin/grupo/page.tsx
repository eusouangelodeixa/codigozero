"use client";
// /admin/grupo — Grupo do WhatsApp EXCLUSIVO de membros (assinantes).
// Config: escolher o grupo do Komunika + link de convite (exibido no QG só
// pra assinante ativo). Monitor: participantes AO VIVO cruzados com as
// assinaturas — em dia, equipe, quem remover (com botão de remoção real via
// Komunika) e números desconhecidos (nunca removidos automaticamente).
import { useEffect, useRef, useState } from "react";
import styles from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import { AdminPage } from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface RemoveRow {
  jid: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEnd?: string | null;
}

interface Status {
  configured: boolean;
  error?: string;
  groupId?: string;
  groupName?: string | null;
  inviteLink?: string | null;
  counts?: { participants: number; ok: number; team: number; toRemove: number; unknown: number };
  toRemove?: RemoveRow[];
  unknown?: { jid: string; phone: string }[];
  queue?: { pending: number; pendingJids: string[]; lastProcessedAt?: string | null };
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

interface GroupMsg {
  id: string;
  kind: "text" | "media" | "audio";
  content?: string | null;
  mediaUrl?: string | null;
  mentionAll: boolean;
  scheduledAt: string;
  status: string;
  error?: string | null;
  sentAt?: string | null;
}

const KIND_LABEL: Record<string, string> = { text: "Texto", media: "Mídia", audio: "Áudio (voz)" };

export default function AdminGrupo() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null); // jid | "all"
  const [toast, setToast] = useState("");

  // ── Composer do grupo ──
  const [msgKind, setMsgKind] = useState<"text" | "media" | "audio">("text");
  const [msgText, setMsgText] = useState("");
  const [msgMentionAll, setMsgMentionAll] = useState(true);
  const [msgMediaUrl, setMsgMediaUrl] = useState("");
  const [msgMediaType, setMsgMediaType] = useState("");
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const [schedMode, setSchedMode] = useState<"now" | "later">("now");
  const [schedAt, setSchedAt] = useState("");
  const [sending, setSending] = useState(false);
  const [msgs, setMsgs] = useState<{ pending: GroupMsg[]; history: GroupMsg[] }>({ pending: [], history: [] });

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const loadMessages = async () => {
    try {
      const r = await fetch(`${API}/api/admin/members-group/messages`, { headers: hdr() });
      const d = await r.json();
      setMsgs({ pending: d.pending || [], history: d.history || [] });
    } catch {}
  };

  const uploadGroupFile = async (file: File): Promise<{ url: string; type: string } | null> => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/api/admin/members-group/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` },
        body: fd,
      });
      const d = await r.json();
      if (!r.ok || !d.url) { showToast(d.error || "Falha no upload"); return null; }
      return { url: d.url, type: d.type };
    } catch {
      showToast("Erro de conexão no upload");
      return null;
    } finally {
      setUploading(false);
    }
  };

  const pickFile = (accept: string, cb: (f: File) => void) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => { const f = input.files?.[0]; if (f) cb(f); };
    input.click();
  };

  // Gravador nativo: o áudio sai como MENSAGEM DE VOZ no grupo (ptt).
  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recChunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunksRef.current, { type: rec.mimeType || "audio/webm" });
        const ext = (rec.mimeType || "").includes("mp4") ? "m4a" : "webm";
        const up = await uploadGroupFile(new File([blob], `voz-${Date.now()}.${ext}`, { type: blob.type }));
        if (up) { setMsgMediaUrl(up.url); setMsgMediaType("audio"); showToast("Áudio gravado ✓"); }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      showToast("Sem acesso ao microfone");
    }
  };

  const stopRec = () => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  const sendGroupMessage = async () => {
    if (msgKind === "text" && !msgText.trim()) { showToast("Escreve a mensagem."); return; }
    if (msgKind !== "text" && !msgMediaUrl) { showToast("Falta o arquivo."); return; }
    if (schedMode === "later" && !schedAt) { showToast("Escolhe a data/hora."); return; }
    setSending(true);
    try {
      const r = await fetch(`${API}/api/admin/members-group/messages`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          kind: msgKind,
          content: msgText.trim() || undefined,
          mediaUrl: msgMediaUrl || undefined,
          mentionAll: msgKind === "audio" ? false : msgMentionAll,
          scheduledAt: schedMode === "later" ? new Date(schedAt).toISOString() : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao enviar");
      showToast(schedMode === "later" ? "Agendado ✓" : "Na fila — sai em instantes ✓");
      setMsgText(""); setMsgMediaUrl(""); setMsgMediaType(""); setSchedMode("now"); setSchedAt("");
      loadMessages();
    } catch (e: any) {
      showToast(e?.message || "Erro ao enviar.");
    } finally {
      setSending(false);
    }
  };

  const cancelMsg = async (id: string) => {
    if (!window.confirm("Cancelar esta mensagem agendada?")) return;
    try {
      const r = await fetch(`${API}/api/admin/members-group/messages/${id}`, { method: "DELETE", headers: hdr() });
      if (!r.ok) throw new Error();
      showToast("Cancelada ✓");
      loadMessages();
    } catch {
      showToast("Erro ao cancelar.");
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/members-group/status`, { headers: hdr() });
      const d = await r.json();
      setStatus(d);
      if (d?.groupId) { setGroupId(d.groupId); setGroupName(d.groupName || ""); }
      if (typeof d?.inviteLink === "string") setInviteLink(d.inviteLink);
    } catch {
      setStatus({ configured: false, error: "Erro de conexão" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); loadMessages(); }, []);

  const loadGroups = async () => {
    setLoadingGroups(true);
    setGroupsError("");
    try {
      const r = await fetch(`${API}/api/admin/central/groups?sync=1`, { headers: hdr() });
      const d = await r.json();
      setGroups(Array.isArray(d.groups) ? d.groups : []);
      if (d.error) setGroupsError(d.error);
      else if (!d.groups?.length) setGroupsError("Nenhum grupo encontrado na instância admin do Komunika.");
    } catch {
      setGroupsError("Erro de conexão ao carregar os grupos.");
    } finally {
      setLoadingGroups(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/system`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({
          membersGroupId: groupId || null,
          membersGroupName: groupName || null,
          membersGroupInviteLink: inviteLink.trim() || null,
        }),
      });
      if (!r.ok) throw new Error();
      showToast("Configuração salva ✓");
      loadStatus();
    } catch {
      showToast("Erro ao salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  // AGENDA a remoção: o servidor processa em lotes de 3 com intervalo
  // aleatório de 10-15 min (anti-ban) e re-checa a assinatura em cada lote —
  // quem renovar enquanto espera NÃO é removido.
  const scheduleRemoval = async (rows: RemoveRow[], label: string) => {
    if (!rows.length) return;
    if (!window.confirm(`Agendar a remoção de ${label}? A saída acontece em lotes de 3, a cada 10–15 minutos (ritmo seguro). Quem renovar enquanto espera não é removido.`)) return;
    setRemoving(rows.length > 1 ? "all" : rows[0].jid);
    try {
      const r = await fetch(`${API}/api/admin/members-group/remove`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ rows: rows.map((x) => ({ jid: x.jid, phone: x.phone, name: x.name || null })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao agendar");
      showToast(d.alreadyQueued ? `${d.queued} agendado(s) — ${d.alreadyQueued} já estavam na fila` : `${d.queued} agendado(s) pra remoção ✓`);
      loadStatus();
    } catch (e: any) {
      showToast(e?.message || "Erro ao agendar.");
    } finally {
      setRemoving(null);
    }
  };

  const c = status?.counts;

  return (
    <AdminPage
      title="Grupo de Membros"
      actions={
        <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={loadStatus} disabled={loading}>
          {loading ? "Atualizando…" : "↻ Atualizar"}
        </button>
      }
    >
      {/* ── Config ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>⚙️ Grupo pago de assinantes</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
          O grupo é <strong>privado</strong>: o link de convite aparece em Comunidades só pra quem tem assinatura ativa,
          e tu aprovas cada entrada no WhatsApp. O monitor abaixo cruza os participantes com as assinaturas.
          <strong> Não confundir</strong> com o grupo grátis de leads (Captura — Reels).
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <select
            className={styles.formInput}
            style={{ maxWidth: 420 }}
            value={groupId}
            onChange={(e) => {
              const id = e.target.value;
              setGroupId(id);
              setGroupName(groups.find((g) => g.id === id)?.name || (id === status?.groupId ? status?.groupName || "" : ""));
            }}
          >
            <option value="">— Nenhum grupo (monitor desativado) —</option>
            {groupId && !groups.some((g) => g.id === groupId) && (
              <option value={groupId}>{groupName || groupId}</option>
            )}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button className={styles.btnSecondary} onClick={loadGroups} disabled={loadingGroups}>
            {loadingGroups ? "Carregando…" : "Carregar grupos do Komunika"}
          </button>
        </div>
        {groupsError && <p style={{ fontSize: 13, color: "var(--color-error, #f87171)", marginBottom: 10 }}>{groupsError}</p>}
        <div className={`${styles.formGroup} ${styles.formGroupFull}`} style={{ marginBottom: 14 }}>
          <label className={styles.formLabel}>Link de convite do WhatsApp (exibido em Comunidades)</label>
          <input
            className={styles.formInput}
            placeholder="https://chat.whatsapp.com/…"
            value={inviteLink}
            onChange={(e) => setInviteLink(e.target.value)}
          />
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 2px 0" }}>
            Enquanto vazio, o card do grupo não aparece na página Comunidades dos membros.
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={saveConfig} disabled={saving}>
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
      </div>

      {/* ── Composer: enviar mensagem no grupo ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📣 Enviar no grupo</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 14 }}>
          Texto (com todos marcados), mídia ou áudio — o áudio chega como <strong>mensagem de voz</strong>,
          como se gravada na hora. Envia já ou agenda.
        </p>

        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {(["text", "media", "audio"] as const).map((kd) => (
            <button
              key={kd}
              className={msgKind === kd ? styles.btnPrimary : styles.btnSecondary}
              style={{ padding: "8px 16px" }}
              onClick={() => { setMsgKind(kd); setMsgMediaUrl(""); setMsgMediaType(""); }}
            >
              {kd === "text" ? "💬 Texto" : kd === "media" ? "🖼️ Mídia" : "🎙️ Áudio"}
            </button>
          ))}
        </div>

        {msgKind !== "audio" && (
          <div className={`${styles.formGroup} ${styles.formGroupFull}`} style={{ marginBottom: 12 }}>
            <label className={styles.formLabel}>{msgKind === "text" ? "Mensagem" : "Legenda (opcional)"}</label>
            <textarea
              className={styles.formTextarea}
              rows={4}
              placeholder={msgKind === "text" ? "Escreve a mensagem pro grupo… (*negrito* funciona)" : "Legenda da mídia…"}
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
            />
          </div>
        )}

        {msgKind === "media" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            <button className={styles.btnSecondary} disabled={uploading} onClick={() => pickFile("image/*,video/*", async (f) => { const up = await uploadGroupFile(f); if (up) { setMsgMediaUrl(up.url); setMsgMediaType(up.type); } })}>
              {uploading ? "Enviando…" : msgMediaUrl ? "Trocar arquivo" : "Escolher imagem/vídeo"}
            </button>
            {msgMediaUrl && msgMediaType === "image" && (
              <img src={msgMediaUrl} alt="" style={{ height: 54, borderRadius: 8, objectFit: "cover" }} />
            )}
            {msgMediaUrl && msgMediaType === "video" && <span className={`${styles.badge} ${styles.badgeTeal}`}>🎬 vídeo pronto</span>}
          </div>
        )}

        {msgKind === "audio" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
            {!recording ? (
              <button className={styles.btnSecondary} disabled={uploading} onClick={startRec}>🔴 Gravar agora</button>
            ) : (
              <button className={styles.btnPrimary} style={{ background: "var(--color-error, #ef4444)" }} onClick={stopRec}>⏹️ Parar gravação</button>
            )}
            <button className={styles.btnSecondary} disabled={uploading || recording} onClick={() => pickFile("audio/*", async (f) => { const up = await uploadGroupFile(f); if (up) { setMsgMediaUrl(up.url); setMsgMediaType("audio"); } })}>
              {uploading ? "Enviando…" : "…ou subir arquivo de áudio"}
            </button>
            {msgMediaUrl && msgMediaType === "audio" && <audio controls src={msgMediaUrl} style={{ height: 36 }} />}
          </div>
        )}

        <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          {msgKind !== "audio" && (
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={msgMentionAll} onChange={(e) => setMsgMentionAll(e.target.checked)} />
              Marcar todos os membros
            </label>
          )}
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
            <input type="radio" checked={schedMode === "now"} onChange={() => setSchedMode("now")} /> Enviar agora
          </label>
          <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
            <input type="radio" checked={schedMode === "later"} onChange={() => setSchedMode("later")} /> Agendar
          </label>
          {schedMode === "later" && (
            <input
              type="datetime-local"
              className={styles.formInput}
              style={{ maxWidth: 220 }}
              value={schedAt}
              onChange={(e) => setSchedAt(e.target.value)}
            />
          )}
        </div>

        <button className={styles.btnPrimary} disabled={sending || uploading || recording} onClick={sendGroupMessage}>
          {sending ? "Enviando…" : schedMode === "later" ? "Agendar envio" : "Enviar no grupo"}
        </button>

        {msgs.pending.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>⏳ Agendadas</div>
            {msgs.pending.map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13.5 }}>
                <span className={`${styles.badge} ${styles.badgeTeal}`}>{KIND_LABEL[m.kind]}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                  {m.content || (m.kind === "audio" ? "mensagem de voz" : "mídia")}
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>{fmtDateTime(m.scheduledAt)}</span>
                {m.mentionAll && <span title="Marca todos">@todos</span>}
                <button className={styles.btnSecondary} style={{ padding: "4px 10px" }} onClick={() => cancelMsg(m.id)}>Cancelar</button>
              </div>
            ))}
          </div>
        )}

        {msgs.history.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Histórico recente</div>
            {msgs.history.map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 13.5 }}>
                <span className={`${styles.badge} ${m.status === "sent" ? styles.badgeGreen : m.status === "failed" ? styles.badgeRed : styles.badgeGray}`}>
                  {m.status === "sent" ? "enviada" : m.status === "failed" ? "falhou" : "cancelada"}
                </span>
                <span className={`${styles.badge} ${styles.badgeGray}`}>{KIND_LABEL[m.kind]}</span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                  {m.content || (m.kind === "audio" ? "mensagem de voz" : "mídia")}
                </span>
                <span style={{ color: "var(--text-tertiary)" }}>{fmtDateTime(m.sentAt || m.scheduledAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Monitor ── */}
      {!status?.configured && !loading ? (
        <div className={styles.card}>
          <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
            Escolhe o grupo do Komunika acima e salva pra ligar o monitor.
          </p>
        </div>
      ) : (
        <>
          {status?.error && (
            <div className={styles.card} style={{ marginBottom: 20, borderColor: "rgba(239,68,68,0.35)" }}>
              <p style={{ color: "var(--color-error, #f87171)", fontSize: 14 }}>⚠️ {status.error}</p>
            </div>
          )}

          {c && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
              {[
                { label: "No grupo", value: c.participants, color: "var(--text-primary)" },
                { label: "Em dia", value: c.ok, color: "var(--color-success, #22c55e)" },
                { label: "Equipe", value: c.team, color: "var(--accent)" },
                { label: "A remover", value: c.toRemove, color: c.toRemove > 0 ? "var(--color-error, #f87171)" : "var(--text-primary)" },
                { label: "Desconhecidos", value: c.unknown, color: "var(--color-warning, #f59e0b)" },
              ].map((s) => (
                <div key={s.label} className={styles.card} style={{ padding: 16 }}>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.8 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4, color: s.color }}>{loading ? "…" : s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── Fila de remoção em andamento ── */}
          {(status?.queue?.pending || 0) > 0 && (
            <div className={styles.card} style={{ marginBottom: 20, borderColor: "var(--accent-border, rgba(45,212,191,0.3))" }}>
              <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                ⏳ <strong>{status!.queue!.pending}</strong> remoç{status!.queue!.pending === 1 ? "ão agendada" : "ões agendadas"} na fila
                — saindo em lotes de 3, a cada 10–15 minutos (ritmo seguro anti-ban).
                {status!.queue!.lastProcessedAt && <> Último lote: {new Date(status!.queue!.lastProcessedAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}.</>}
              </p>
            </div>
          )}

          {/* ── A remover ── */}
          <div className={styles.card} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>🚫 Assinatura vencida — remoção do grupo</h2>
              {(status?.toRemove?.filter((r) => !status?.queue?.pendingJids?.includes(r.jid)).length || 0) > 1 && (
                <button
                  className={styles.btnPrimary}
                  style={{ background: "var(--color-error, #ef4444)" }}
                  disabled={removing !== null}
                  onClick={() => {
                    const rows = status!.toRemove!.filter((r) => !status?.queue?.pendingJids?.includes(r.jid));
                    scheduleRemoval(rows, `os ${rows.length} participantes vencidos`);
                  }}
                >
                  {removing === "all" ? "Agendando…" : `Agendar remoção de todos`}
                </button>
              )}
            </div>
            <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12 }}>
              <strong>Automático:</strong> todo dia às 09:00 o sistema agenda sozinho a remoção de quem venceu há
              mais de 3 dias (carência pra renovação atrasada). Os botões abaixo servem só pra <strong>antecipar</strong>.
            </p>
            {!status?.toRemove?.length ? (
              <p style={{ color: "var(--text-tertiary)", fontSize: 14 }}>
                {loading ? "Consultando o grupo…" : "Ninguém pra remover — todo mundo no grupo está em dia. ✓"}
              </p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Telefone</th>
                      <th>E-mail</th>
                      <th>Assinatura</th>
                      <th>Venceu em</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.toRemove.map((r) => {
                      const queued = status?.queue?.pendingJids?.includes(r.jid);
                      return (
                        <tr key={r.jid}>
                          <td>{r.name || "—"}</td>
                          <td>+{r.phone}</td>
                          <td>{r.email || "—"}</td>
                          <td><span className={`${styles.badge} ${styles.badgeRed}`}>{r.subscriptionStatus || "sem status"}</span></td>
                          <td>{fmtDate(r.subscriptionEnd)}</td>
                          <td>
                            {queued ? (
                              <span className={`${styles.badge} ${styles.badgeTeal}`}>⏳ na fila</span>
                            ) : (
                              <button
                                className={styles.btnSecondary}
                                disabled={removing !== null}
                                onClick={() => scheduleRemoval([r], r.name || `+${r.phone}`)}
                              >
                                {removing === r.jid ? "Agendando…" : "Agendar remoção"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Desconhecidos ── */}
          {(status?.unknown?.length || 0) > 0 && (
            <div className={styles.card}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>❓ Números sem cadastro na base</h2>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 12 }}>
                Podem ser equipe, segundo número de um membro ou convidados. O sistema <strong>nunca</strong> marca
                esses pra remoção automática — revisa manualmente.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {status!.unknown!.map((u) => (
                  <span key={u.jid} className={`${styles.badge} ${styles.badgeYellow}`}>+{u.phone}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "var(--bg-elevated, #1a1a2e)", border: "1px solid var(--border-default)", borderRadius: 10, padding: "12px 18px", fontSize: 14, zIndex: 50 }}>
          {toast}
        </div>
      )}
    </AdminPage>
  );
}
