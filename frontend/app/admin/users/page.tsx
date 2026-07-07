"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "../admin.module.css";
import DateRangeFilter, { DateRange } from "@/components/admin/DateRangeFilter";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

const STATUS_LABEL: Record<string, string> = {
  active: "Ativo", grace_period: "Carência", overdue: "Atrasado", canceled: "Cancelado", lead: "Lead",
};

function statusBadgeClass(s: string) {
  const map: Record<string, string> = {
    active: styles.badgeGreen, lead: styles.badgeYellow, canceled: styles.badgeRed,
    overdue: styles.badgeRed, grace_period: styles.badgeYellow,
  };
  return map[s] || styles.badgeGray;
}

/** Renders the subscription expiry date + a "em N dias" / "há N dias" hint. */
function Expiry({ end }: { end?: string }) {
  if (!end) return <span className={styles.mCardLabel}>—</span>;
  const date = new Date(end);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const cls = days < 0 ? styles.expiryUrgent : days <= 3 ? styles.expiryUrgent : days <= 7 ? styles.expiryWarn : "";
  const hint =
    days < 0 ? `expirou há ${Math.abs(days)}d` : days === 0 ? "expira hoje" : `em ${days}d`;
  return (
    <span className={`${styles.expiry} ${cls}`}>
      <span className={styles.expiryDate}>{date.toLocaleDateString("pt-BR")}</span>
      <span className={styles.expiryDays}>{hint}</span>
    </span>
  );
}

/** First platform access status — ✓ + date when accessed, else "Pendente".
 *  Only meaningful for paying members: leads (no access yet) and non-members
 *  show "—". */
function FirstAccess({ at, role, status }: { at?: string; role?: string; status?: string }) {
  if ((role && role !== "member") || status === "lead") return <span className={styles.mCardLabel}>—</span>;
  if (at)
    return (
      <span className={`${styles.badge} ${styles.badgeGreen}`} title={new Date(at).toLocaleString("pt-BR")}>
        ✓ {new Date(at).toLocaleDateString("pt-BR")}
      </span>
    );
  return <span className={`${styles.badge} ${styles.badgeYellow}`}>Pendente</span>;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [range, setRange] = useState<DateRange>({ period: "all" });
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState("");
  // "Conceder acesso" (trial grant) modal
  const [granting, setGranting] = useState(false);
  const [grantForm, setGrantForm] = useState({ name: "", email: "", whatsapp: "", duration: "7d" });
  const [grantBusy, setGrantBusy] = useState(false);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (role !== "all") params.set("role", role);
    if (range.period !== "all") {
      params.set("period", range.period);
      if (range.period === "custom") {
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
      }
    }
    fetch(`${API}/api/admin/users?${params}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => { setUsers(data.users || []); setTotal(data.total || 0); });
  }, [search, status, role, range]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const [exporting, setExporting] = useState(false);

  // Export the current view as CSV. The route is auth-gated, so we fetch with
  // the Bearer header → blob → trigger download (no raw URL navigation). Passes
  // the same filters as load() so the file matches what's on screen.
  const exportCsv = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status !== "all") params.set("status", status);
    if (role !== "all") params.set("role", role);
    if (range.period !== "all") {
      params.set("period", range.period);
      if (range.period === "custom") {
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
      }
    }
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/admin/users/export?${params}`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      showToast("Falha ao exportar CSV");
    } finally {
      setExporting(false);
    }
  }, [search, status, role, range]);

  const handleSave = async () => {
    if (!editing) return;
    await fetch(`${API}/api/admin/users/${editing.id}`, {
      method: "PATCH", headers: hdr(), body: JSON.stringify(editing),
    });
    showToast("Usuário atualizado ✓");
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remover "${name}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`${API}/api/admin/users/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Usuário removido ✓");
    load();
  };

  const toggleActive = async (user: any) => {
    await fetch(`${API}/api/admin/users/${user.id}`, {
      method: "PATCH", headers: hdr(), body: JSON.stringify({ isActive: !user.isActive }),
    });
    showToast(user.isActive ? "Usuário desativado" : "Usuário ativado");
    load();
  };

  // Conceder acesso de teste (7 dias / 1 mês): cria/atualiza o usuário, libera o
  // plano e envia as credenciais por WhatsApp + e-mail (igual à compra real).
  const handleGrant = async () => {
    const { name, email, whatsapp } = grantForm;
    if (!name.trim() || !email.trim() || !whatsapp.trim()) {
      showToast("Preencha nome, e-mail e WhatsApp");
      return;
    }
    setGrantBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/users/grant-trial`, {
        method: "POST", headers: hdr(), body: JSON.stringify(grantForm),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(d.error || "Erro ao conceder acesso"); return; }
      const ch = [d.delivery?.whatsapp ? "WhatsApp" : null, d.delivery?.email ? "e-mail" : null].filter(Boolean).join(" + ");
      showToast(`${d.created ? "Usuário criado" : "Acesso atualizado"} · ${d.durationDays}d · credenciais por ${ch || "—"}`);
      setGranting(false);
      setGrantForm({ name: "", email: "", whatsapp: "", duration: "7d" });
      load();
    } catch {
      showToast("Erro de conexão");
    } finally {
      setGrantBusy(false);
    }
  };

  const statusBadge = (s: string) => (
    <span className={`${styles.badge} ${statusBadgeClass(s)}`}>{STATUS_LABEL[s] || s}</span>
  );

  const toDateInput = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : "");

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Gestão de Usuários</h1>
        <p className={styles.pageDesc}>{total} usuários no sistema</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableToolbar}>
          <input className={styles.tableSearch} placeholder="Buscar por nome, email ou telefone..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={styles.formSelect} style={{ maxWidth: 170 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="grace_period">Carência</option>
            <option value="overdue">Atrasados</option>
            <option value="canceled">Cancelados</option>
            <option value="lead">Leads</option>
          </select>
          <select className={styles.formSelect} style={{ maxWidth: 150 }} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="all">Todos os papéis</option>
            <option value="member">Membros</option>
            <option value="admin">Admins</option>
            <option value="superadmin">Superadmins</option>
          </select>
        </div>
        <div className={styles.tableToolbar}>
          <button type="button" className={styles.btnPrimary} onClick={() => setGranting(true)}>
            ＋ Conceder acesso
          </button>
          <DateRangeFilter value={range} onChange={setRange} />
          <button
            type="button"
            className={styles.filterBtn}
            style={{ marginLeft: "auto" }}
            onClick={exportCsv}
            disabled={exporting}
          >
            {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr><th>Nome</th><th>Email</th><th>Role</th><th>Status</th><th>Expira</th><th>Ativo</th><th>1º acesso</th><th>Criado</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={9} className={styles.empty}>Nenhum usuário encontrado</td></tr>
            ) : users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className={`${styles.badge} ${u.role === "member" ? styles.badgeGray : styles.badgeTeal}`}>{u.role}</span></td>
                <td>{statusBadge(u.subscriptionStatus)}</td>
                <td><Expiry end={u.subscriptionEnd} /></td>
                <td>{u.isActive ? "✅" : "❌"}</td>
                <td><FirstAccess at={u.firstAccessAt} role={u.role} status={u.subscriptionStatus} /></td>
                <td>{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.actionBtn} onClick={() => setEditing({ ...u })}>Editar</button>
                    <button className={styles.actionBtn} onClick={() => toggleActive(u)}>{u.isActive ? "Desativar" : "Ativar"}</button>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => handleDelete(u.id, u.name)}>Remover</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.mobileCards}>
          {users.length === 0 ? (
            <div className={styles.empty}>Nenhum usuário encontrado</div>
          ) : users.map((u) => (
            <div key={u.id} className={styles.mCard}>
              <div className={styles.mCardHead}>
                <span className={styles.mCardName}>{u.name}</span>
                {statusBadge(u.subscriptionStatus)}
              </div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Email</span><span className={styles.mCardValue}>{u.email}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Telefone</span><span className={styles.mCardValue}>{u.phone}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Expira</span><span className={styles.mCardValue}><Expiry end={u.subscriptionEnd} /></span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Ativo</span><span className={styles.mCardValue}>{u.isActive ? "Sim" : "Não"}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>1º acesso</span><span className={styles.mCardValue}><FirstAccess at={u.firstAccessAt} role={u.role} status={u.subscriptionStatus} /></span></div>
              <div className={styles.mCardActions}>
                <button className={styles.actionBtn} onClick={() => setEditing({ ...u })}>Editar</button>
                <button className={styles.actionBtn} onClick={() => toggleActive(u)}>{u.isActive ? "Desativar" : "Ativar"}</button>
                <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => handleDelete(u.id, u.name)}>Remover</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <div className={styles.modalOverlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Editar Usuário</h2>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nome</label>
                <input className={styles.formInput} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email</label>
                <input className={styles.formInput} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Role</label>
                <select className={styles.formSelect} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Status Assinatura</label>
                <select className={styles.formSelect} value={editing.subscriptionStatus} onChange={(e) => setEditing({ ...editing, subscriptionStatus: e.target.value })}>
                  <option value="active">Ativo</option>
                  <option value="lead">Lead</option>
                  <option value="grace_period">Período de Graça</option>
                  <option value="overdue">Atrasado</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Assinatura expira em</label>
                <input
                  className={styles.formInput}
                  type="date"
                  value={toDateInput(editing.subscriptionEnd)}
                  onChange={(e) => setEditing({ ...editing, subscriptionEnd: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nova Senha (opcional)</label>
                <input className={styles.formInput} type="password" placeholder="Deixar vazio para manter" onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={handleSave}>Salvar</button>
              <button className={styles.btnSecondary} onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {granting && (
        <div className={styles.modalOverlay} onClick={() => !grantBusy && setGranting(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Conceder acesso (teste)</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>
              Cria o usuário, libera o plano pelo período e envia as credenciais por WhatsApp e e-mail.
              Depois do período, o usuário entra no fluxo normal de pagamento.
            </p>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nome</label>
                <input className={styles.formInput} value={grantForm.name} onChange={(e) => setGrantForm({ ...grantForm, name: e.target.value })} placeholder="Nome do usuário" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email</label>
                <input className={styles.formInput} type="email" value={grantForm.email} onChange={(e) => setGrantForm({ ...grantForm, email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>WhatsApp</label>
                <input className={styles.formInput} value={grantForm.whatsapp} onChange={(e) => setGrantForm({ ...grantForm, whatsapp: e.target.value })} placeholder="84 123 4567 (fora de MZ: +55 …)" />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Duração do teste</label>
                <select className={styles.formSelect} value={grantForm.duration} onChange={(e) => setGrantForm({ ...grantForm, duration: e.target.value })}>
                  <option value="7d">7 dias</option>
                  <option value="1m">1 mês</option>
                </select>
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={handleGrant} disabled={grantBusy}>
                {grantBusy ? "Concedendo…" : "Conceder e enviar acesso"}
              </button>
              <button className={styles.btnSecondary} onClick={() => setGranting(false)} disabled={grantBusy}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
