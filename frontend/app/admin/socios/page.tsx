"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  RowActions,
  type Column,
  type RowAction,
} from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Partner {
  id: string;
  displayName: string;
  roleLabel: string | null;
  sharePct: number;
  enabled: boolean;
  lifetimeEarnings: number;
  lifetimeSales: number;
  availableBalance: number;
  user: { id: string; name: string; email: string; phone: string };
}

const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmt = (n: number) => n.toLocaleString("pt-BR");

const EMPTY_ADD = { displayName: "", email: "", phone: "", sharePct: "", roleLabel: "" };

export default function AdminPartnersPage() {
  const [rows, setRows] = useState<Partner[]>([]);
  const [shareTotal, setShareTotal] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  // Add-partner modal
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD);
  const [creating, setCreating] = useState(false);

  // Edit modal (sharePct + rótulos)
  const [editing, setEditing] = useState<{ id: string; displayName: string; sharePct: string; roleLabel: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    fetch(`${API}/api/admin/partners?${p}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        setRows(data.items || data.partners || []);
        setTotal(data.total ?? (data.items || data.partners || []).length);
        setTotalPages(data.totalPages || 1);
        setShareTotal(data.shareTotal || 0);
      })
      .catch(() => showToast("Erro ao carregar sócios"))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const pct = parseFloat(addForm.sharePct);
    if (!addForm.email.trim() || !Number.isFinite(pct)) {
      showToast("Informe email e percentual válidos");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/admin/partners`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          userEmail: addForm.email.trim(),
          phone: addForm.phone.trim() || undefined,
          name: addForm.displayName.trim() || undefined,
          sharePct: pct,
          roleLabel: addForm.roleLabel.trim() || undefined,
          displayName: addForm.displayName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const w = data.welcome;
        showToast(
          w?.delivered
            ? "Sócio adicionado · acesso enviado pelo WhatsApp"
            : `Sócio adicionado · WhatsApp não confirmou (${w?.status ?? "—"}). Use "Reenviar acesso".`,
        );
        setAddForm(EMPTY_ADD);
        setAdding(false);
        setPage(1);
        load();
      } else {
        showToast(data.error || "Falha ao adicionar sócio");
      }
    } catch {
      showToast("Erro de conexão");
    }
    setCreating(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const pct = parseFloat(editing.sharePct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      showToast("Percentual inválido (0–100)");
      return;
    }
    setBusyId(editing.id);
    try {
      const res = await fetch(`${API}/api/admin/partners/${editing.id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({
          sharePct: pct,
          roleLabel: editing.roleLabel.trim(),
          displayName: editing.displayName.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Sócio atualizado");
        setEditing(null);
        load();
      } else {
        showToast(data.error || "Falha ao atualizar");
      }
    } catch {
      showToast("Erro de conexão");
    }
    setBusyId(null);
  };

  const resendWelcome = async (p: Partner) => {
    setBusyId(p.id);
    try {
      const res = await fetch(`${API}/api/admin/partners/${p.id}/resend-welcome`, { method: "POST", headers: hdr() });
      const data = await res.json().catch(() => ({}));
      showToast(res.ok ? "Acesso reenviado pelo WhatsApp" : data.error || "Falha ao reenviar acesso");
    } catch {
      showToast("Erro de conexão");
    }
    setBusyId(null);
  };

  const toggleEnabled = async (p: Partner) => {
    setBusyId(p.id);
    try {
      const res = await fetch(`${API}/api/admin/partners/${p.id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      const data = await res.json().catch(() => ({}));
      showToast(res.ok ? (p.enabled ? "Sócio desativado" : "Sócio ativado") : data.error || "Falha");
      if (res.ok) load();
    } catch {
      showToast("Erro de conexão");
    }
    setBusyId(null);
  };

  const columns: Column<Partner>[] = [
    {
      key: "socio", header: "Sócio", primaryOnMobile: true,
      render: (p) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{p.displayName}</span>
          <span className={k.cellSub}>{p.user?.email}</span>
        </div>
      ),
    },
    {
      key: "papel", header: "Papel", muted: true, hideOnMobile: true,
      render: (p) => p.roleLabel || "—",
    },
    {
      key: "share", header: "%", align: "right", mono: true, mobileLabel: "Participação",
      render: (p) => `${p.sharePct}%`,
    },
    {
      key: "disponivel", header: "Disponível", align: "right", mono: true, mobileLabel: "Disponível",
      render: (p) => fmtMzn(p.availableBalance),
    },
    {
      key: "ganho", header: "Total ganho", align: "right", mono: true, muted: true, hideOnMobile: true,
      render: (p) => fmtMzn(p.lifetimeEarnings),
    },
    {
      key: "vendas", header: "Vendas", align: "right", mono: true, muted: true, hideOnMobile: true,
      render: (p) => fmt(p.lifetimeSales),
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (p) => (
        <StatusBadge tone={p.enabled ? "good" : "neutral"}>{p.enabled ? "Ativo" : "Inativo"}</StatusBadge>
      ),
    },
  ];

  const rowActions = (p: Partner): ReactNode => {
    const items: RowAction[] = [
      {
        label: "Editar",
        onClick: () => setEditing({ id: p.id, displayName: p.displayName, sharePct: String(p.sharePct), roleLabel: p.roleLabel || "" }),
        disabled: busyId === p.id,
      },
      { label: "Reenviar acesso", onClick: () => resendWelcome(p), disabled: busyId === p.id },
      { label: p.enabled ? "Desativar" : "Ativar", onClick: () => toggleEnabled(p), disabled: busyId === p.id, danger: p.enabled },
    ];
    return <RowActions items={items} />;
  };

  return (
    <>
      <AdminPage
        title="Sócios"
        actions={
          <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={() => setAdding(true)}>
            ＋ Adicionar sócio
          </button>
        }
        kpis={
          <StatRow>
            <StatTile accent label="Sócios" loading={loading && rows.length === 0} value={fmt(total)} />
            <StatTile
              label="Participação ativa"
              loading={loading && rows.length === 0}
              value={`${shareTotal}%`}
              tone={shareTotal === 100 ? "good" : "warn"}
            />
          </StatRow>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          loading={loading}
          empty={{ title: "Nenhum sócio cadastrado", desc: 'Use "Adicionar sócio" para incluir uma participação no rateio.' }}
          rowActions={rowActions}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
        />
      </AdminPage>

      {adding && (
        <div className={a.modalOverlay} onClick={() => !creating && setAdding(false)}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>Adicionar sócio</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>
              Divide o líquido de cada venda do produto principal. A soma das participações ativas deve fechar em 100%.
            </p>
            <div className={a.formGrid}>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Nome de exibição</label>
                <input className={a.formInput} value={addForm.displayName} onChange={(e) => setAddForm({ ...addForm, displayName: e.target.value })} placeholder="Nome do sócio" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Email</label>
                <input className={a.formInput} type="email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} placeholder="email@exemplo.com" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>WhatsApp</label>
                <input className={a.formInput} value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} placeholder="84 123 4567" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Participação (%)</label>
                <input className={a.formInput} type="number" value={addForm.sharePct} onChange={(e) => setAddForm({ ...addForm, sharePct: e.target.value })} placeholder="ex.: 35" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Papel</label>
                <input className={a.formInput} value={addForm.roleLabel} onChange={(e) => setAddForm({ ...addForm, roleLabel: e.target.value })} placeholder="ex.: Design" />
              </div>
            </div>
            <p style={{ color: "var(--text-tertiary)", fontSize: 12, margin: "12px 0 0" }}>
              Se o email já tiver conta, ele vira sócio. Se não, criamos a conta com o WhatsApp informado. O acesso (email + senha) é enviado pelo WhatsApp. Só superadmin pode adicionar.
            </p>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={create} disabled={creating}>{creating ? "Adicionando…" : "Adicionar e enviar acesso"}</button>
              <button className={a.btnSecondary} onClick={() => setAdding(false)} disabled={creating}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className={a.modalOverlay} onClick={() => setEditing(null)}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>Editar sócio</h2>
            <div className={a.formGrid}>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Participação (%)</label>
                <input className={a.formInput} type="number" value={editing.sharePct} onChange={(e) => setEditing({ ...editing, sharePct: e.target.value })} placeholder="0 – 100" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Nome de exibição</label>
                <input className={a.formInput} value={editing.displayName} onChange={(e) => setEditing({ ...editing, displayName: e.target.value })} placeholder="Nome do sócio" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Papel</label>
                <input className={a.formInput} value={editing.roleLabel} onChange={(e) => setEditing({ ...editing, roleLabel: e.target.value })} placeholder="ex.: Design" />
              </div>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={saveEdit} disabled={busyId === editing.id}>{busyId === editing.id ? "Salvando…" : "Salvar"}</button>
              <button className={a.btnSecondary} onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={a.toast}>{toast}</div>}
    </>
  );
}
