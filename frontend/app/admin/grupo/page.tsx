"use client";
// /admin/grupo — Grupo do WhatsApp EXCLUSIVO de membros (assinantes).
// Config: escolher o grupo do Komunika + link de convite (exibido no QG só
// pra assinante ativo). Monitor: participantes AO VIVO cruzados com as
// assinaturas — em dia, equipe, quem remover (com botão de remoção real via
// Komunika) e números desconhecidos (nunca removidos automaticamente).
import { useEffect, useState } from "react";
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
}

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "—";

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

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

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

  useEffect(() => { loadStatus(); }, []);

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

  const removeJids = async (jids: string[], label: string) => {
    if (!jids.length) return;
    if (!window.confirm(`Remover ${label} do grupo do WhatsApp? Essa ação é imediata.`)) return;
    setRemoving(jids.length > 1 ? "all" : jids[0]);
    try {
      const r = await fetch(`${API}/api/admin/members-group/remove`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ jids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Falha ao remover");
      showToast(`Removido${jids.length > 1 ? "s" : ""} ✓`);
      loadStatus();
    } catch (e: any) {
      showToast(e?.message || "Erro ao remover.");
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
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>⚙️ Configuração</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
          O grupo é <strong>privado</strong>: o link de convite aparece no QG só pra quem tem assinatura ativa,
          e tu aprovas cada entrada no WhatsApp. O monitor abaixo cruza os participantes com as assinaturas.
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
          <label className={styles.formLabel}>Link de convite do WhatsApp (exibido no QG)</label>
          <input
            className={styles.formInput}
            placeholder="https://chat.whatsapp.com/…"
            value={inviteLink}
            onChange={(e) => setInviteLink(e.target.value)}
          />
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 2px 0" }}>
            Enquanto vazio, o card do grupo não aparece no QG dos membros.
          </p>
        </div>
        <button className={styles.btnPrimary} onClick={saveConfig} disabled={saving}>
          {saving ? "Salvando…" : "Salvar configuração"}
        </button>
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

          {/* ── A remover ── */}
          <div className={styles.card} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>🚫 Assinatura vencida — remover do grupo</h2>
              {(status?.toRemove?.length || 0) > 1 && (
                <button
                  className={styles.btnPrimary}
                  style={{ background: "var(--color-error, #ef4444)" }}
                  disabled={removing !== null}
                  onClick={() => removeJids(status!.toRemove!.map((r) => r.jid), `os ${status!.toRemove!.length} participantes vencidos`)}
                >
                  {removing === "all" ? "Removendo…" : `Remover todos (${status!.toRemove!.length})`}
                </button>
              )}
            </div>
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
                    {status.toRemove.map((r) => (
                      <tr key={r.jid}>
                        <td>{r.name || "—"}</td>
                        <td>+{r.phone}</td>
                        <td>{r.email || "—"}</td>
                        <td><span className={`${styles.badge} ${styles.badgeRed}`}>{r.subscriptionStatus || "sem status"}</span></td>
                        <td>{fmtDate(r.subscriptionEnd)}</td>
                        <td>
                          <button
                            className={styles.btnSecondary}
                            disabled={removing !== null}
                            onClick={() => removeJids([r.jid], r.name || `+${r.phone}`)}
                          >
                            {removing === r.jid ? "Removendo…" : "Remover"}
                          </button>
                        </td>
                      </tr>
                    ))}
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
