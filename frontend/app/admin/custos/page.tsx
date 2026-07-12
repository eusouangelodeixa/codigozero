"use client";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  SegmentedControl,
  RowActions,
  type Column,
} from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });
const fmt = (n: number) => (n || 0).toLocaleString("pt-BR");
const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" });

const CATEGORIES = [
  { v: "ferramentas", l: "Ferramentas" },
  { v: "ads", l: "Anúncios" },
  { v: "salario", l: "Salários" },
  { v: "infra", l: "Infraestrutura" },
  { v: "impostos", l: "Impostos" },
  { v: "outro", l: "Outro" },
];
const catLabel = (v: string) => CATEGORIES.find((c) => c.v === v)?.l || "Outro";

const PERIODS: { value: string; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "12m", label: "12 meses" },
  { value: "all", label: "Tudo" },
];

interface Cost {
  id: string;
  description: string;
  amount: number;
  category: string;
  allocation: "company" | "shared";
  incurredAt: string;
  note?: string | null;
  createdBy?: { name: string } | null;
}
interface Totals { company: number; shared: number; total: number; count: number }

const EMPTY_FORM = { desc: "", amount: "", category: "outro", allocation: "company" as "company" | "shared", incurredAt: "", note: "" };

export default function AdminCustos() {
  const [role, setRole] = useState("");
  const [period, setPeriod] = useState("30d");
  const [costs, setCosts] = useState<Cost[]>([]);
  const [totals, setTotals] = useState<Totals>({ company: 0, shared: 0, total: 0, count: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    try { setRole(JSON.parse(localStorage.getItem("cz_user") || "{}").role || ""); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ period, page: String(page), pageSize: String(pageSize) });
      const r = await fetch(`${API}/api/admin/costs?${p}`, { headers: hdr() });
      if (r.ok) {
        const j = await r.json();
        setCosts(j.items || j.costs || []);
        setTotals(j.totals || { company: 0, shared: 0, total: 0, count: 0 });
        setTotal(j.total || 0);
        setTotalPages(j.totalPages || 1);
      }
    } catch {}
    setLoading(false);
  }, [period, page]);
  useEffect(() => { load(); }, [load]);

  // Trocar o período reinicia a paginação (busca única a partir da página 1).
  const onPeriod = (v: string) => { setPeriod(v); setPage(1); };

  const openCreate = () => { setForm(EMPTY_FORM); setCreating(true); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!form.desc.trim()) { showToast("Informe a descrição."); return; }
    if (!Number.isFinite(amt) || amt <= 0) { showToast("Informe um valor válido."); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/costs`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          description: form.desc,
          amount: amt,
          category: form.category,
          allocation: form.allocation,
          incurredAt: form.incurredAt || undefined,
          note: form.note,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setCreating(false);
      setForm(EMPTY_FORM);
      if (page !== 1) setPage(1); else load();
      showToast("Custo lançado ✓");
    } catch (e2) {
      showToast(e2 instanceof Error ? e2.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const remove = async (c: Cost) => {
    if (!confirm(`Excluir "${c.description}"?\n\nAs parcelas ainda em aberto dos sócios serão removidas.`)) return;
    try {
      const r = await fetch(`${API}/api/admin/costs/${c.id}`, { method: "DELETE", headers: hdr() });
      if (r.ok) { showToast("Custo excluído ✓"); load(); }
      else showToast("Erro ao excluir custo");
    } catch { showToast("Erro de conexão"); }
  };

  if (role && role !== "superadmin") {
    return (
      <AdminPage title="Custos">
        <div className={k.tableCard}>
          <div className={k.empty}>
            <span className={k.emptyTitle}>Acesso restrito</span>
            <span className={k.emptyDesc}>Apenas o superadmin pode ver os custos.</span>
          </div>
        </div>
      </AdminPage>
    );
  }

  const columns: Column<Cost>[] = [
    {
      key: "custo", header: "Custo", primaryOnMobile: true,
      render: (c) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{c.description}</span>
          {(c.note || c.createdBy?.name) && (
            <span className={k.cellSub}>{[c.note, c.createdBy?.name].filter(Boolean).join(" · ")}</span>
          )}
        </div>
      ),
    },
    {
      key: "tipo", header: "Tipo", mobileLabel: "Tipo",
      render: (c) =>
        c.allocation === "shared"
          ? <StatusBadge tone="accent" noDot>Rateado</StatusBadge>
          : <StatusBadge tone="neutral" noDot>Empresa</StatusBadge>,
    },
    { key: "categoria", header: "Categoria", muted: true, hideOnMobile: true, render: (c) => catLabel(c.category) },
    { key: "data", header: "Data", muted: true, render: (c) => fmtDate(c.incurredAt) },
    { key: "valor", header: "Valor", align: "right", mono: true, render: (c) => `−${fmtMoney(c.amount)}` },
  ];

  const rowActions = (c: Cost): ReactNode => (
    <RowActions items={[{ label: "Excluir", onClick: () => remove(c), danger: true }]} />
  );

  return (
    <>
      <AdminPage
        title="Custos"
        actions={
          <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={openCreate}>
            ＋ Lançar custo
          </button>
        }
        kpis={
          <StatRow>
            <StatTile accent label="Total" loading={loading} value={fmtMoney(totals.total)} />
            <StatTile label="Rateado" loading={loading} value={fmtMoney(totals.shared)} />
            <StatTile label="Empresa" loading={loading} value={fmtMoney(totals.company)} />
            <StatTile label="Lançamentos" loading={loading} value={fmt(totals.count)} />
          </StatRow>
        }
      >
        <DataTable
          columns={columns}
          rows={costs}
          getRowKey={(c) => c.id}
          loading={loading}
          empty={{ title: "Nenhum custo no período", desc: "Ajuste o período ou lance um novo custo." }}
          rowActions={rowActions}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
          toolbar={
            <SegmentedControl value={period} onChange={onPeriod} options={PERIODS} />
          }
        />
      </AdminPage>

      {creating && (
        <div className={a.modalOverlay} onClick={() => !saving && setCreating(false)}>
          <form className={a.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2 className={a.modalTitle}>Lançar custo</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>
              Gastos abatidos do lucro. Custos <strong>rateados</strong> são divididos entre os sócios pelo % de cada um e reduzem o saldo a sacar.
            </p>
            <div className={a.formGrid}>
              <div className={`${a.formGroup} ${a.formGroupFull}`}>
                <label className={a.formLabel}>Descrição</label>
                <input className={a.formInput} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} placeholder="Ex.: Assinatura de ferramenta, anúncios, salário…" autoFocus />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Valor (MZN)</label>
                <input className={a.formInput} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Categoria</label>
                <select className={a.formSelect} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Tipo</label>
                <select className={a.formSelect} value={form.allocation} onChange={(e) => setForm({ ...form, allocation: e.target.value as "company" | "shared" })}>
                  <option value="company">Custo da empresa</option>
                  <option value="shared">Rateado entre os sócios</option>
                </select>
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Data</label>
                <input className={a.formInput} type="date" value={form.incurredAt} onChange={(e) => setForm({ ...form, incurredAt: e.target.value })} />
              </div>
              <div className={`${a.formGroup} ${a.formGroupFull}`}>
                <label className={a.formLabel}>Nota (opcional)</label>
                <input className={a.formInput} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Detalhe / referência" />
              </div>
            </div>
            {form.allocation === "shared" && (
              <p style={{ color: "var(--accent)", fontSize: 12, margin: "12px 0 0" }}>
                Será dividido entre os sócios ativos pelo % de cada um e descontado do saldo a sacar deles.
              </p>
            )}
            <div className={a.btnRow}>
              <button type="submit" className={a.btnPrimary} disabled={saving}>{saving ? "Salvando…" : "Lançar custo"}</button>
              <button type="button" className={a.btnSecondary} onClick={() => setCreating(false)} disabled={saving}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className={a.toast}>{toast}</div>}
    </>
  );
}
