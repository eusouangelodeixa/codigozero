"use client";
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });
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
const PERIODS = [
  { v: "today", l: "Hoje" },
  { v: "7d", l: "7 dias" },
  { v: "30d", l: "30 dias" },
  { v: "12m", l: "12 meses" },
  { v: "all", l: "Tudo" },
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

const field: CSSProperties = {
  padding: "10px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)",
  borderRadius: 8, color: "var(--text-primary)", fontSize: 14, fontFamily: "inherit", width: "100%",
};
const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--text-secondary)" };

export default function AdminCustos() {
  const [role, setRole] = useState("");
  const [period, setPeriod] = useState("30d");
  const [costs, setCosts] = useState<Cost[]>([]);
  const [totals, setTotals] = useState<Totals>({ company: 0, shared: 0, total: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("outro");
  const [allocation, setAllocation] = useState<"company" | "shared">("company");
  const [incurredAt, setIncurredAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    try { setRole(JSON.parse(localStorage.getItem("cz_user") || "{}").role || ""); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/costs?period=${period}`, { headers: hdr() });
      if (r.ok) {
        const j = await r.json();
        setCosts(j.costs || []);
        setTotals(j.totals || { company: 0, shared: 0, total: 0, count: 0 });
      }
    } catch {}
    setLoading(false);
  }, [period]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    const amt = Number(amount);
    if (!desc.trim()) { setErr("Informe a descrição."); return; }
    if (!Number.isFinite(amt) || amt <= 0) { setErr("Informe um valor válido."); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/costs`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ description: desc, amount: amt, category, allocation, incurredAt: incurredAt || undefined, note }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao salvar");
      setDesc(""); setAmount(""); setNote(""); setIncurredAt(""); setAllocation("company"); setCategory("outro");
      load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Erro ao salvar");
    }
    setSaving(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este custo? As parcelas ainda em aberto dos sócios serão removidas.")) return;
    try {
      const r = await fetch(`${API}/api/admin/costs/${id}`, { method: "DELETE", headers: hdr() });
      if (r.ok) load();
    } catch {}
  };

  if (role && role !== "superadmin") {
    return (
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>💸 Custos</h1>
        <p className={styles.pageDesc}>Acesso restrito ao superadmin.</p>
      </div>
    );
  }

  const allocBadge = (a: string) =>
    a === "shared" ? (
      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--accent-border)" }}>Rateado (sócios)</span>
    ) : (
      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid var(--border-default)" }}>Empresa</span>
    );

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>💸 Custos</h1>
        <p className={styles.pageDesc}>
          Gastos abatidos do lucro. Custos <strong>rateados</strong> são divididos entre os sócios pelo % de cada um e reduzem o saldo a sacar.
        </p>
      </div>

      {/* Period chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {PERIODS.map((p) => (
          <button
            key={p.v}
            type="button"
            onClick={() => setPeriod(p.v)}
            style={{
              padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
              border: "1px solid " + (period === p.v ? "var(--accent-border)" : "var(--border-default)"),
              background: period === p.v ? "var(--accent-dim)" : "transparent",
              color: period === p.v ? "var(--accent)" : "var(--text-secondary)",
            }}
          >
            {p.l}
          </button>
        ))}
      </div>

      {/* Totals */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total de custos", value: totals.total, hint: `${totals.count} lançamento(s)` },
          { label: "Rateados (sócios)", value: totals.shared, hint: "divididos pelo % de cada sócio" },
          { label: "Da empresa", value: totals.company, hint: "abatem só do lucro" },
        ].map((c) => (
          <div key={c.label} style={{ padding: 16, borderRadius: 12, background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>{fmtMoney(c.value)}</div>
            <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 4 }}>{c.hint}</div>
          </div>
        ))}
      </div>

      {/* Add cost */}
      <form onSubmit={submit} style={{ padding: 18, borderRadius: 12, background: "var(--bg-surface)", border: "1px solid var(--border-default)", marginBottom: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Lançar custo</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label style={{ ...label, gridColumn: "1 / -1" }}>
            <span>Descrição</span>
            <input style={field} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Assinatura de ferramenta, anúncios, salário…" />
          </label>
          <label style={label}>
            <span>Valor (MZN)</span>
            <input style={field} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </label>
          <label style={label}>
            <span>Categoria</span>
            <select style={{ ...field, cursor: "pointer" }} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </label>
          <label style={label}>
            <span>Tipo</span>
            <select style={{ ...field, cursor: "pointer" }} value={allocation} onChange={(e) => setAllocation(e.target.value as "company" | "shared")}>
              <option value="company">Custo da empresa</option>
              <option value="shared">Rateado entre os sócios</option>
            </select>
          </label>
          <label style={label}>
            <span>Data</span>
            <input style={field} type="date" value={incurredAt} onChange={(e) => setIncurredAt(e.target.value)} />
          </label>
          <label style={{ ...label, gridColumn: "1 / -1" }}>
            <span>Nota (opcional)</span>
            <input style={field} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalhe / referência" />
          </label>
        </div>
        {allocation === "shared" && (
          <div style={{ fontSize: 12, color: "var(--accent)", background: "var(--accent-dim)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "8px 12px" }}>
            Será dividido entre os sócios ativos pelo % de cada um e descontado do saldo a sacar deles.
          </div>
        )}
        {err && <div style={{ fontSize: 13, color: "var(--color-error)" }}>{err}</div>}
        <div>
          <button type="submit" disabled={saving} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-fg, #001412)", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Salvando…" : "Lançar custo"}
          </button>
        </div>
      </form>

      {/* List */}
      <div style={{ borderRadius: 12, background: "var(--bg-surface)", border: "1px solid var(--border-default)", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Carregando…</div>
        ) : costs.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>Nenhum custo no período.</div>
        ) : (
          costs.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{c.description}</span>
                  {allocBadge(c.allocation)}
                  <span style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.04)" }}>{catLabel(c.category)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 3 }}>
                  {fmtDate(c.incurredAt)}{c.createdBy?.name ? ` · ${c.createdBy.name}` : ""}{c.note ? ` · ${c.note}` : ""}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                −{fmtMoney(c.amount)}
              </div>
              <button type="button" onClick={() => remove(c.id)} title="Excluir" aria-label="Excluir" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-tertiary)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}
