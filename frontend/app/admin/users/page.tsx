"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  SearchInput,
  RowActions,
  DateRangeFilter,
  type Column,
  type RowAction,
  type DateRange,
} from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface U {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isActive: boolean;
  subscriptionStatus: string;
  subscriptionEnd?: string;
  firstAccessAt?: string;
  createdAt: string;
}
interface Metrics { active: number; expiring7d: number; overdue: number; newInPeriod: number }

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Data de expiração + dica "em N dias" / "expirou há N", com cor de urgência. */
function Expiry({ end }: { end?: string }) {
  if (!end) return <span className={k.cellMuted}>—</span>;
  const date = new Date(end);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const cls = days <= 3 ? a.expiryUrgent : days <= 7 ? a.expiryWarn : "";
  const hint = days < 0 ? `há ${Math.abs(days)}d` : days === 0 ? "hoje" : `em ${days}d`;
  return (
    <span className={`${a.expiry} ${cls}`}>
      <span className={a.expiryDate}>{date.toLocaleDateString("pt-BR")}</span>
      <span className={a.expiryDays}>{hint}</span>
    </span>
  );
}

function FirstAccess({ at, role, status }: { at?: string; role?: string; status?: string }) {
  if ((role && role !== "member") || status === "lead") return <span className={k.cellMuted}>—</span>;
  if (at) return <StatusBadge tone="good" noDot>✓ {new Date(at).toLocaleDateString("pt-BR")}</StatusBadge>;
  return <StatusBadge tone="warn" noDot>Pendente</StatusBadge>;
}

const IconActive = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>);
const IconClock = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
const IconAlert = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></svg>);
const IconNew = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 11v6M19 14h6" /></svg>);

export default function AdminUsers() {
  const [users, setUsers] = useState<U[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [range, setRange] = useState<DateRange>({ period: "all" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantForm, setGrantForm] = useState({ name: "", email: "", whatsapp: "", duration: "7d" });
  const [grantBusy, setGrantBusy] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendResult, setResendResult] = useState<any>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (status !== "all") p.set("status", status);
    if (role !== "all") p.set("role", role);
    if (range.period !== "all") {
      p.set("period", range.period);
      if (range.period === "custom") {
        if (range.from) p.set("from", range.from);
        if (range.to) p.set("to", range.to);
      }
    }
    return p;
  }, [search, status, role, range]);

  const load = useCallback(() => {
    setLoading(true);
    const p = buildParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    fetch(`${API}/api/admin/users?${p}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || data.lastPage || 1);
        if (data.metrics) setMetrics(data.metrics);
      })
      .catch(() => showToast("Falha ao carregar usuários"))
      .finally(() => setLoading(false));
  }, [buildParams, page]);

  useEffect(() => { load(); }, [load]);

  // Setters de filtro que resetam a paginação para a página 1 (busca única).
  const onSearch = (v: string) => { setSearch(v); setPage(1); };
  const onStatus = (v: string) => { setStatus(v); setPage(1); };
  const onRole = (v: string) => { setRole(v); setPage(1); };
  const onRange = (r: DateRange) => { setRange(r); setPage(1); };

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/admin/users/export?${buildParams()}`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = document.createElement("a");
      el.href = url;
      el.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(el);
      el.click();
      el.remove();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Falha ao exportar CSV");
    } finally {
      setExporting(false);
    }
  }, [buildParams]);

  const handleSave = async () => {
    if (!editing) return;
    await fetch(`${API}/api/admin/users/${editing.id}`, { method: "PATCH", headers: hdr(), body: JSON.stringify(editing) });
    showToast("Usuário atualizado ✓");
    setEditing(null);
    load();
  };
  const handleDelete = async (u: U) => {
    if (!confirm(`Remover "${u.name}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`${API}/api/admin/users/${u.id}`, { method: "DELETE", headers: hdr() });
    showToast("Usuário removido ✓");
    load();
  };
  const toggleActive = async (u: U) => {
    await fetch(`${API}/api/admin/users/${u.id}`, { method: "PATCH", headers: hdr(), body: JSON.stringify({ isActive: !u.isActive }) });
    showToast(u.isActive ? "Usuário desativado" : "Usuário ativado");
    load();
  };
  const handleGrant = async () => {
    const { name, email, whatsapp } = grantForm;
    if (!name.trim() || !email.trim() || !whatsapp.trim()) { showToast("Preencha nome, e-mail e WhatsApp"); return; }
    setGrantBusy(true);
    try {
      const r = await fetch(`${API}/api/admin/users/grant-trial`, { method: "POST", headers: hdr(), body: JSON.stringify(grantForm) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(d.error || "Erro ao conceder acesso"); return; }
      showToast(`${d.created ? "Usuário criado" : "Acesso atualizado"} · ${d.durationDays} dias · credenciais enviadas`);
      setGranting(false);
      setGrantForm({ name: "", email: "", whatsapp: "", duration: "7d" });
      load();
    } catch { showToast("Erro de conexão"); } finally { setGrantBusy(false); }
  };
  const handleResend = async (u: U) => {
    if (!confirm(`Reenviar acesso de "${u.name}"?\n\nGera uma NOVA senha e envia por WhatsApp + e-mail. A senha atual deixará de funcionar.`)) return;
    setResendingId(u.id);
    try {
      const r = await fetch(`${API}/api/admin/users/${u.id}/resend-access`, { method: "POST", headers: hdr() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { showToast(d.error || "Erro ao reenviar acesso"); return; }
      setResendResult(d);
    } catch { showToast("Erro de conexão"); } finally { setResendingId(null); }
  };

  const toDateInput = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : "");

  const columns: Column<U>[] = [
    {
      key: "user", header: "Usuário", primaryOnMobile: true,
      render: (u) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{u.name}</span>
          <span className={k.cellSub}>{u.email}</span>
        </div>
      ),
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (u) => (
        <span className={k.cellInline}>
          <StatusBadge kind="subscription" value={u.subscriptionStatus} />
          {!u.isActive && <StatusBadge tone="danger" noDot>Inativo</StatusBadge>}
        </span>
      ),
    },
    {
      key: "role", header: "Papel", hideOnMobile: true,
      render: (u) => (u.role === "member" ? <span className={k.cellMuted}>membro</span> : <StatusBadge tone="accent" noDot>{u.role}</StatusBadge>),
    },
    { key: "expira", header: "Expira", render: (u) => <Expiry end={u.subscriptionEnd} /> },
    { key: "acesso", header: "1º acesso", render: (u) => <FirstAccess at={u.firstAccessAt} role={u.role} status={u.subscriptionStatus} /> },
    { key: "criado", header: "Criado", muted: true, hideOnMobile: true, render: (u) => new Date(u.createdAt).toLocaleDateString("pt-BR") },
  ];

  const rowActions = (u: U): ReactNode => {
    const items: RowAction[] = [
      { label: "Editar", onClick: () => setEditing({ ...u }) },
      { label: resendingId === u.id ? "Enviando…" : "Reenviar acesso", onClick: () => handleResend(u), disabled: resendingId === u.id },
      { label: u.isActive ? "Desativar" : "Ativar", onClick: () => toggleActive(u) },
      { label: "Remover", onClick: () => handleDelete(u), danger: true },
    ];
    return <RowActions items={items} />;
  };

  return (
    <>
      <AdminPage
        eyebrow="Pessoas"
        title="Usuários"
        desc="Membros pagantes, admins e leads. Busque, filtre e gerencie acessos."
        actions={
          <>
            <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={exportCsv} disabled={exporting}>
              {exporting ? "Exportando…" : "Exportar CSV"}
            </button>
            <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={() => setGranting(true)}>
              ＋ Conceder acesso
            </button>
          </>
        }
        kpis={
          <StatRow>
            <StatTile accent label="Ativos" icon={<IconActive />} loading={!metrics} value={metrics && fmt(metrics.active)} hint="assinaturas em dia" tone="good" />
            <StatTile label="Vencendo em 7d" icon={<IconClock />} loading={!metrics} value={metrics && fmt(metrics.expiring7d)} hint="renovações próximas" tone={metrics && metrics.expiring7d > 0 ? "warn" : undefined} />
            <StatTile label="Atrasados" icon={<IconAlert />} loading={!metrics} value={metrics && fmt(metrics.overdue)} hint="assinatura vencida" tone={metrics && metrics.overdue > 0 ? "danger" : undefined} />
            <StatTile label="Novos no período" icon={<IconNew />} loading={!metrics} value={metrics && fmt(metrics.newInPeriod)} hint="cadastros recentes" />
          </StatRow>
        }
      >
        <DataTable
          columns={columns}
          rows={users}
          getRowKey={(u) => u.id}
          loading={loading}
          empty={{ title: "Nenhum usuário encontrado", desc: "Ajuste a busca ou os filtros." }}
          rowActions={rowActions}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
          toolbar={
            <>
              <SearchInput defaultValue={search} onSearch={onSearch} placeholder="Buscar por nome, e-mail ou telefone…" />
              <select className={k.select} value={status} onChange={(e) => onStatus(e.target.value)} aria-label="Status">
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="grace_period">Carência</option>
                <option value="overdue">Atrasados</option>
                <option value="canceled">Cancelados</option>
                <option value="lead">Leads</option>
              </select>
              <select className={k.select} value={role} onChange={(e) => onRole(e.target.value)} aria-label="Papel">
                <option value="all">Todos os papéis</option>
                <option value="member">Membros</option>
                <option value="admin">Admins</option>
                <option value="superadmin">Superadmins</option>
              </select>
              <div className={k.toolbarSpacer} />
              <DateRangeFilter value={range} onChange={onRange} />
            </>
          }
        />
      </AdminPage>

      {editing && (
        <div className={a.modalOverlay} onClick={() => setEditing(null)}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>Editar Usuário</h2>
            <div className={a.formGrid}>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Nome</label>
                <input className={a.formInput} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Email</label>
                <input className={a.formInput} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Role</label>
                <select className={a.formSelect} value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value })}>
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Status Assinatura</label>
                <select className={a.formSelect} value={editing.subscriptionStatus} onChange={(e) => setEditing({ ...editing, subscriptionStatus: e.target.value })}>
                  <option value="active">Ativo</option>
                  <option value="lead">Lead</option>
                  <option value="grace_period">Período de Graça</option>
                  <option value="overdue">Atrasado</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Assinatura expira em</label>
                <input className={a.formInput} type="date" value={toDateInput(editing.subscriptionEnd)} onChange={(e) => setEditing({ ...editing, subscriptionEnd: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Nova Senha (opcional)</label>
                <input className={a.formInput} type="password" placeholder="Deixar vazio para manter" onChange={(e) => setEditing({ ...editing, password: e.target.value })} />
              </div>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={handleSave}>Salvar</button>
              <button className={a.btnSecondary} onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {granting && (
        <div className={a.modalOverlay} onClick={() => !grantBusy && setGranting(false)}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>Conceder acesso (teste)</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>
              Cria o usuário, libera o plano pelo período e envia as credenciais por WhatsApp e e-mail. Depois do período, entra no fluxo normal de pagamento.
            </p>
            <div className={a.formGrid}>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Nome</label>
                <input className={a.formInput} value={grantForm.name} onChange={(e) => setGrantForm({ ...grantForm, name: e.target.value })} placeholder="Nome do usuário" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Email</label>
                <input className={a.formInput} type="email" value={grantForm.email} onChange={(e) => setGrantForm({ ...grantForm, email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>WhatsApp</label>
                <input className={a.formInput} value={grantForm.whatsapp} onChange={(e) => setGrantForm({ ...grantForm, whatsapp: e.target.value })} placeholder="84 123 4567 (fora de MZ: +55 …)" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Duração do teste</label>
                <select className={a.formSelect} value={grantForm.duration} onChange={(e) => setGrantForm({ ...grantForm, duration: e.target.value })}>
                  <option value="7d">7 dias</option>
                  <option value="1m">1 mês</option>
                </select>
              </div>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={handleGrant} disabled={grantBusy}>{grantBusy ? "Concedendo…" : "Conceder e enviar acesso"}</button>
              <button className={a.btnSecondary} onClick={() => setGranting(false)} disabled={grantBusy}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {resendResult && (
        <div className={a.modalOverlay} onClick={() => setResendResult(null)}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>Acesso reenviado ✓</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>
              Uma nova senha foi gerada e enviada por WhatsApp e e-mail. Se algum canal falhar, copie os dados abaixo e envie manualmente.
            </p>
            <div className={a.formGrid}>
              <div className={a.formGroup}>
                <label className={a.formLabel}>E-mail</label>
                <input className={a.formInput} readOnly value={resendResult.email || ""} onFocus={(e) => e.target.select()} />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Nova senha</label>
                <input className={a.formInput} readOnly value={resendResult.password || ""} style={{ fontFamily: "ui-monospace, Menlo, monospace", letterSpacing: "0.04em" }} onFocus={(e) => e.target.select()} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, margin: "12px 0 4px", color: "var(--text-secondary)" }}>
              <span>WhatsApp: {resendResult.whatsapp?.delivered ? "✅ entregue" : `⚠️ falhou (${resendResult.whatsapp?.status})`}</span>
              <span>E-mail: {resendResult.emailDelivery?.ok ? "✅ enviado" : `⚠️ falhou (${resendResult.emailDelivery?.status})`}</span>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={() => {
                const pw = resendResult.password || "";
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(pw).then(() => showToast("Senha copiada ✓"), () => showToast("Selecione a senha acima para copiar"));
                } else showToast("Copie manualmente: selecione a senha acima");
              }}>Copiar senha</button>
              <button className={a.btnSecondary} onClick={() => setResendResult(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={a.toast}>{toast}</div>}
    </>
  );
}
