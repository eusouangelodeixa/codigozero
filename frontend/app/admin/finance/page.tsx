"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { MetricCard, RevenueChart, type Period as ChartPeriod } from "@/components/admin";
import adminStyles from "../admin.module.css";
import styles from "./finance.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Period = "today" | "7d" | "30d" | "12m" | "custom";

interface Metrics {
  revenue: number;
  revenueGrowth: number;
  ticket: number;
  ticketGrowth: number;
  count: number;
  countGrowth: number;
  newRevenue: number;
  newCount: number;
  renewalRevenue: number;
  renewalCount: number;
  closeFriendsRevenue: number;
  closeFriendsCount: number;
  mrr: number;
  mrrTheoretical?: number;
  netTicketAvg?: number;
  activePaidUsers: number;
  renewalRate: number | null;
  churnRate: number | null;
  expectedRenewals: number;
  realizedRenewals: number;
  grossRevenue?: number;
  totalLojouFee?: number;
  totalCoproducerFee?: number;
  refundedCount?: number;
  refundedAmount?: number;
  failedCount?: number;
  failedAmount?: number;
}

interface Tx {
  id: string;
  orderId: string;
  userName?: string | null;
  userEmail?: string | null;
  userPhone?: string | null;
  amount: number;
  status: string;
  paymentMethod?: string | null;
  createdAt: string;
  isRenewal: boolean;
  isCloseFriends: boolean;
  orderBumpAmount?: number | null;
  coproducerId?: string | null;
  coproducer?: { id: string; code: string; displayName: string | null; user: { name: string } } | null;
  grossAmount?: number | null;
  lojouFee?: number | null;
  coproducerFee?: number | null;
  gateway?: string | null;
  stripePaymentIntentId?: string | null;
}

interface CoproducerOpt {
  id: string;
  code: string;
  displayName: string | null;
  user: { name: string };
}

interface FinanceData {
  window: { period: string; from: string; to: string };
  metrics: Metrics;
  chartData: { date: string; amount: number; new: number; renewal: number }[];
  transactions: { total: number; page: number; limit: number; items: Tx[] };
}

interface UpcomingUser {
  id: string;
  name: string | null;
  email: string;
  phone: string;
  subscriptionEnd: string;
  closeFriends: boolean;
  daysUntilExpiry: number | null;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-MZ", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

const IconRevenue = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);
const IconNew = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const IconRenew = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 11-3-6.7" /><path d="M21 3v6h-6" />
  </svg>
);
const IconUsers = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);
const IconBolt = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);
const IconChurn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 6l-9.5 9.5-5-5L1 18" /><path d="M17 6h6v6" />
  </svg>
);

const IconRefund = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2v6h6" /><path d="M3 13a9 9 0 103-7.7L3 8" />
  </svg>
);
const IconCancel = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);
const IconFunnel = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 4h18l-7 8v6l-4 2v-8z" />
  </svg>
);

const modalField: CSSProperties = {
  padding: "9px 12px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  color: "var(--text-primary)",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
};
const modalLabel: CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 13 };
const modalLabelTitle: CSSProperties = { color: "var(--text-secondary)" };

const statusBadge = (s: string) => {
  if (s === "approved") return <Badge variant="success" size="sm">Aprovada</Badge>;
  if (s === "refunded") return <Badge variant="warning" size="sm">Reembolsada</Badge>;
  if (s === "failed" || s === "cancelled" || s === "canceled") return <Badge variant="error" size="sm">Cancelada</Badge>;
  return <Badge variant="neutral" size="sm">Pendente</Badge>;
};

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "12m", label: "12 meses" },
  { value: "custom", label: "Personalizado" },
];

// Map our extended period to what RevenueChart accepts internally
const toChartPeriod = (p: Period): ChartPeriod =>
  p === "12m" ? "12m" : p === "7d" ? "7d" : "30d";

export default function AdminFinance() {
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<Period>("30d");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [source, setSource] = useState<string>("all"); // all | principal | <coproducerId>
  const [txType, setTxType] = useState<string>("all"); // all | new | renewal | closeFriends
  const [txStatus, setTxStatus] = useState<string>("all"); // all | approved | failed | refunded | pending
  const [coproducers, setCoproducers] = useState<CoproducerOpt[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [page, setPage] = useState(1);
  const limit = 25;

  const [upcoming, setUpcoming] = useState<UpcomingUser[]>([]);

  // ── Funnel re-injection (failed / refunded / cancelled sales) ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [funnels, setFunnels] = useState<{ id?: string; _id?: string; name?: string; title?: string }[]>([]);
  const [funnelsError, setFunnelsError] = useState("");
  const [injectOpen, setInjectOpen] = useState(false);
  const [injectFunnel, setInjectFunnel] = useState("");
  const [injectFunnelManual, setInjectFunnelManual] = useState("");
  const [intMin, setIntMin] = useState(60);
  const [intMax, setIntMax] = useState(180);
  const [injecting, setInjecting] = useState(false);
  const [injectMsg, setInjectMsg] = useState("");

  const funnelKey = (f: { id?: string; _id?: string }) => f.id || f._id || "";
  const funnelLabel = (f: { name?: string; title?: string; id?: string; _id?: string }) =>
    f.name || f.title || f.id || f._id || "Funil";

  // Debounce search input → 300ms
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("cz_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({
        period,
        page: String(page),
        limit: String(limit),
        source,
      });
      if (txType !== "all") params.set("txType", txType);
      if (txStatus !== "all") params.set("txStatus", txStatus);
      if (search) params.set("search", search);
      if (period === "custom" && from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      const [financeRes, upcomingRes, coproducersRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/finance?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/api/admin/finance/upcoming-renewals?days=30&limit=25`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        coproducers.length === 0
          ? fetch(`${API_URL}/api/admin/coproducers`, { headers: { Authorization: `Bearer ${token}` } })
          : Promise.resolve(null),
      ]);
      if (financeRes.ok) setData(await financeRes.json());
      if (upcomingRes.ok) {
        const json = await upcomingRes.json();
        setUpcoming(json.users || []);
      }
      if (coproducersRes && coproducersRes.ok) {
        const json = await coproducersRes.json();
        setCoproducers(json.coproducers || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, page, search, from, to, source, txType, txStatus, router, coproducers.length]);

  useEffect(() => {
    // Don't trigger a custom-range fetch until both dates are set
    if (period === "custom" && (!from || !to)) return;
    fetchData();
  }, [fetchData, period, from, to]);

  // Load the Komunika funnel list once (for the injection selector).
  const loadFunnels = useCallback(async () => {
    const token = localStorage.getItem("cz_token");
    if (!token) return;
    try {
      const r = await fetch(`${API_URL}/api/admin/funnels`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const j = await r.json();
        setFunnels(j.funnels || []);
        setFunnelsError(j.error || "");
      }
    } catch {
      setFunnelsError("Não foi possível carregar os funis.");
    }
  }, []);
  useEffect(() => { loadFunnels(); }, [loadFunnels]);

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const visibleIds = data?.transactions.items.map((t) => t.id) ?? [];
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const toggleAll = () =>
    setSelected((prev) => (visibleIds.every((id) => prev.has(id)) ? new Set() : new Set(visibleIds)));

  const openInject = () => {
    setInjectMsg("");
    setInjectOpen(true);
    if (!funnels.length) loadFunnels();
  };

  const submitInject = async () => {
    const funnelId = (injectFunnelManual.trim() || injectFunnel).trim();
    if (!funnelId) { setInjectMsg("Selecione um funil ou informe um ID."); return; }
    if (selected.size === 0) { setInjectMsg("Selecione ao menos uma venda."); return; }
    if (intMax < intMin) { setInjectMsg("O intervalo máximo deve ser ≥ ao mínimo."); return; }
    const token = localStorage.getItem("cz_token");
    setInjecting(true);
    setInjectMsg("");
    try {
      const r = await fetch(`${API_URL}/api/admin/funnel-injection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          transactionIds: [...selected],
          funnelId,
          intervalMinSec: intMin,
          intervalMaxSec: intMax,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao disparar");
      const skipped = Array.isArray(j.skipped) && j.skipped.length ? ` · ${j.skipped.length} sem telefone (ignorados)` : "";
      setInjectMsg(`✅ ${j.queued} contato(s) enfileirados. O envio roda em segundo plano com intervalo de ${intMin}–${intMax}s${skipped}.`);
      setSelected(new Set());
    } catch (e) {
      setInjectMsg(e instanceof Error ? e.message : "Erro ao disparar");
    }
    setInjecting(false);
  };

  const chartWithCount = useMemo(
    () =>
      (data?.chartData || []).map((d) => ({
        date: d.date,
        amount: d.amount,
        // RevenueChart treats `count` as bars — repurpose for renewals split
        count: d.renewal,
      })),
    [data],
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.transactions.total / limit)) : 1;
  const realizedPctLabel = data?.metrics.renewalRate != null
    ? `${data.metrics.renewalRate.toFixed(0)}% renovaram`
    : "—";

  return (
    <div className={styles.page}>
      <div className={adminStyles.pageHeader}>
        <h1 className={adminStyles.pageTitle}>Financeiro</h1>
        <p className={adminStyles.pageDesc}>
          KPIs ao vivo: receita, MRR, novas vendas, renovações e churn. Comparado ao período anterior.
        </p>
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className={styles.filtersCard}>
        <div className={styles.periodChips}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.periodChip} ${period === opt.value ? styles.periodChipActive : ""}`}
              onClick={() => { setPeriod(opt.value); setPage(1); }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className={styles.customRange}>
            <label className={styles.customRangeLabel}>
              <span>De</span>
              <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </label>
            <label className={styles.customRangeLabel}>
              <span>Até</span>
              <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </label>
          </div>
        )}

        <div className={styles.searchWrap}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={styles.searchIcon}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Buscar por nome, email ou telefone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button type="button" className={styles.searchClear} onClick={() => setSearchInput("")} aria-label="Limpar busca">×</button>
          )}
        </div>

        {/* Source filter: principal vs each coproducer */}
        <select
          value={source}
          onChange={(e) => { setSource(e.target.value); setPage(1); }}
          style={{
            padding: "8px 12px",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 13,
            fontFamily: "inherit",
            cursor: "pointer",
            minWidth: 180,
          }}
        >
          <option value="all">Origem: Todas</option>
          <option value="principal">Origem: Principal</option>
          {coproducers.map((c) => (
            <option key={c.id} value={c.id}>Origem: {c.displayName || c.user.name}</option>
          ))}
        </select>
      </div>

      {/* ── KPI cards ───────────────────────────────────────── */}
      <div className={styles.metricsGrid}>
        <MetricCard
          accent
          label="Faturamento"
          value={data ? fmtMoney(data.metrics.revenue) : undefined}
          loading={loading && !data}
          icon={<IconRevenue />}
          iconAccent
          delta={data?.metrics.revenueGrowth ?? null}
          sub="vs período anterior"
          sparkline={(data?.chartData ?? []).length > 1 ? data!.chartData.map((d) => ({ value: d.amount })) : undefined}
        />
        <MetricCard
          label="MRR ativo"
          value={data ? fmtMoney(data.metrics.mrr) : undefined}
          loading={loading && !data}
          icon={<IconUsers />}
          iconAccent
          sub={data ? `${data.metrics.activePaidUsers} assinantes ativos` : ""}
        />
        <MetricCard
          label="Novas vendas"
          value={data ? data.metrics.newCount.toLocaleString("pt-MZ") : undefined}
          loading={loading && !data}
          icon={<IconNew />}
          iconAccent
          sub={data ? `${fmtMoney(data.metrics.newRevenue)} no período` : ""}
        />
        <MetricCard
          label="Renovações"
          value={data ? data.metrics.renewalCount.toLocaleString("pt-MZ") : undefined}
          loading={loading && !data}
          icon={<IconRenew />}
          iconAccent
          sub={data ? `${fmtMoney(data.metrics.renewalRevenue)} no período` : ""}
        />
        <MetricCard
          label="Taxa de renovação"
          value={data?.metrics.renewalRate != null ? `${data.metrics.renewalRate.toFixed(0)}%` : "—"}
          loading={loading && !data}
          icon={<IconChurn />}
          iconAccent
          sub={data ? `${data.metrics.realizedRenewals}/${data.metrics.expectedRenewals} esperadas` : ""}
        />
        <MetricCard
          label="Ticket médio"
          value={data ? fmtMoney(data.metrics.ticket) : undefined}
          loading={loading && !data}
          icon={<IconBolt />}
          iconAccent
          delta={data?.metrics.ticketGrowth ?? null}
          sub="vs período anterior"
        />
        <MetricCard
          label="Faturamento bruto"
          value={data?.metrics.grossRevenue != null ? fmtMoney(data.metrics.grossRevenue) : undefined}
          loading={loading && !data}
          icon={<IconRevenue />}
          sub="antes de taxa Lojou e split"
        />
        <MetricCard
          label="Taxa Lojou"
          value={data?.metrics.totalLojouFee != null ? fmtMoney(data.metrics.totalLojouFee) : undefined}
          loading={loading && !data}
          icon={<IconBolt />}
          sub="10% + 10 MT por item"
        />
        <MetricCard
          label="Pago a coprodutores"
          value={data?.metrics.totalCoproducerFee != null ? fmtMoney(data.metrics.totalCoproducerFee) : undefined}
          loading={loading && !data}
          icon={<IconUsers />}
          sub="split sobre o principal"
        />
        <MetricCard
          label="Reembolsos"
          value={data ? (data.metrics.refundedCount ?? 0).toLocaleString("pt-MZ") : undefined}
          loading={loading && !data}
          icon={<IconRefund />}
          sub={data ? `${fmtMoney(data.metrics.refundedAmount ?? 0)} no período` : ""}
        />
        <MetricCard
          label="Canceladas"
          value={data ? (data.metrics.failedCount ?? 0).toLocaleString("pt-MZ") : undefined}
          loading={loading && !data}
          icon={<IconCancel />}
          sub={data ? `${fmtMoney(data.metrics.failedAmount ?? 0)} no período` : ""}
        />
      </div>

      {/* ── Chart ───────────────────────────────────────────── */}
      <RevenueChart
        data={chartWithCount}
        period={toChartPeriod(period)}
        total={data?.metrics.revenue}
        delta={data?.metrics.revenueGrowth ?? null}
        title="Evolução da receita"
        eyebrow={`Total · barras = renovações · ${realizedPctLabel}`}
        loading={loading}
        showCount
        formatCurrency={fmtMoney}
      />

      {/* ── Upcoming renewals ───────────────────────────────── */}
      {upcoming.length > 0 && (
        <div className={styles.txCard}>
          <div className={styles.txHead}>
            <span className={styles.txTitle}>Próximas renovações (30 dias)</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {upcoming.length} usuários
            </span>
          </div>
          <div className={styles.txWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Telefone</th>
                  <th>Expira em</th>
                  <th style={{ textAlign: "right" }}>Dias</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className={styles.client}>
                        <span className={styles.clientName}>
                          {u.name || "Membro"}
                          {u.closeFriends && (
                            <span className={styles.cfTag} title="Close Friends">★ CF</span>
                          )}
                        </span>
                        <span className={styles.clientEmail}>{u.email}</span>
                      </div>
                    </td>
                    <td><span className={styles.method}>{u.phone}</span></td>
                    <td>{fmtDate(u.subscriptionEnd)}</td>
                    <td style={{ textAlign: "right" }}>
                      <span className={`${styles.daysLeft} ${u.daysUntilExpiry != null && u.daysUntilExpiry <= 3 ? styles.daysLeftUrgent : ""}`}>
                        {u.daysUntilExpiry ?? "—"}d
                      </span>
                    </td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.txMobile}>
              {upcoming.map((u) => (
                <div key={u.id} className={styles.txMobileCard}>
                  <div className={styles.txmHead}>
                    <span className={styles.txmName}>
                      {u.name || "Membro"}{u.closeFriends && <span className={styles.cfTag} style={{ marginLeft: 6 }}>★ CF</span>}
                    </span>
                    <span className={`${styles.daysLeft} ${u.daysUntilExpiry != null && u.daysUntilExpiry <= 3 ? styles.daysLeftUrgent : ""}`}>
                      {u.daysUntilExpiry ?? "—"}d
                    </span>
                  </div>
                  <div className={styles.txmRow}><span className={styles.txmLabel}>Telefone</span><span className={styles.txmValue}>{u.phone}</span></div>
                  <div className={styles.txmRow}><span className={styles.txmLabel}>Expira em</span><span className={styles.txmValue}>{fmtDate(u.subscriptionEnd)}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Transactions ────────────────────────────────────── */}
      <div className={styles.txCard}>
        <div className={styles.txHead}>
          <span className={styles.txTitle}>Transações</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={openInject}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 8, border: "none",
                  background: "var(--accent)", color: "var(--accent-fg, #001412)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                <IconFunnel /> Infectar funil ({selected.size})
              </button>
            )}
            <select
              value={txType}
              onChange={(e) => { setTxType(e.target.value); setPage(1); }}
              className={styles.txFilter}
            >
              <option value="all">Tipo: Todos</option>
              <option value="new">Novas</option>
              <option value="renewal">Renovações</option>
              <option value="closeFriends">Close Friends</option>
            </select>
            <select
              value={txStatus}
              onChange={(e) => { setTxStatus(e.target.value); setPage(1); }}
              className={styles.txFilter}
            >
              <option value="all">Status: Todos</option>
              <option value="approved">Aprovadas</option>
              <option value="refunded">Reembolsadas</option>
              <option value="failed">Canceladas</option>
              <option value="pending">Pendentes</option>
            </select>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {data ? `${data.transactions.items.length} de ${data.transactions.total}` : "—"}
            </span>
          </div>
        </div>

        <div className={styles.txWrap}>
          {data?.transactions.items.length ? (
            <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Selecionar todas"
                      style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                    />
                  </th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Origem</th>
                  <th>Data</th>
                  <th>Método</th>
                  <th style={{ textAlign: "right" }} title="Valor total pago pelo cliente (produto + bumps), antes das taxas">Bruto</th>
                  <th style={{ textAlign: "right" }} title="Taxa da Lojou: 10% + 10 MT por item">Taxa Lojou</th>
                  <th style={{ textAlign: "right" }} title="Parte repassada ao coprodutor">Split coprod.</th>
                  <th style={{ textAlign: "right" }} title="O que entrou de fato, depois das taxas">Líquido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.items.map((tx) => (
                  <tr key={tx.id} style={selected.has(tx.id) ? { background: "var(--accent-glow, rgba(45,212,191,0.06))" } : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggleRow(tx.id)}
                        aria-label="Selecionar venda"
                        style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                      />
                    </td>
                    <td>
                      <div className={styles.client}>
                        <span className={styles.clientName}>{tx.userName || "Cliente"}</span>
                        <span className={styles.clientEmail}>
                          {tx.userEmail || tx.userPhone || "—"}
                        </span>
                      </div>
                    </td>
                    <td>
                      {tx.isRenewal ? (
                        <Badge variant="info" size="sm">Renovação</Badge>
                      ) : (
                        <Badge variant="success" size="sm">Nova</Badge>
                      )}
                      {tx.isCloseFriends && (
                        <span className={styles.cfTag} style={{ marginLeft: 6 }} title="Close Friends">★ CF</span>
                      )}
                    </td>
                    <td>
                      {tx.coproducer ? (
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(168,85,247,0.12)", color: "#a855f7", fontWeight: 600 }}>
                          {tx.coproducer.displayName || tx.coproducer.user.name}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Principal</span>
                      )}
                    </td>
                    <td>{fmtDateTime(tx.createdAt)}</td>
                    <td>
                      <span className={styles.method}>{tx.paymentMethod || "M-Pesa"}</span>
                      {tx.gateway && tx.gateway !== "lojou" && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 10,
                            padding: "2px 7px",
                            borderRadius: 999,
                            fontWeight: 700,
                            letterSpacing: 0.3,
                            background: tx.gateway === "stripe" ? "rgba(99,91,255,0.14)" : "rgba(168,168,168,0.14)",
                            color: tx.gateway === "stripe" ? "#635bff" : "var(--text-tertiary)",
                          }}
                          title={tx.stripePaymentIntentId || tx.gateway}
                        >
                          {tx.gateway.toUpperCase()}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>
                      {tx.grossAmount != null ? fmtMoney(tx.grossAmount) : "—"}
                      {tx.orderBumpAmount ? (
                        <div style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
                          incl. bump {fmtMoney(tx.orderBumpAmount)}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--text-tertiary)", fontSize: 12 }}>
                      {tx.lojouFee != null ? `−${fmtMoney(tx.lojouFee)}` : "—"}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: tx.coproducerFee ? "#a855f7" : "var(--text-tertiary)", fontSize: 12 }}>
                      {tx.coproducerFee != null && tx.coproducerFee > 0 ? `−${fmtMoney(tx.coproducerFee)}` : "—"}
                    </td>
                    <td className={styles.amount} style={{ textAlign: "right" }}>
                      {fmtMoney(tx.amount)}
                    </td>
                    <td>{statusBadge(tx.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.txMobile}>
              {data.transactions.items.map((tx) => (
                <div key={tx.id} className={styles.txMobileCard} style={selected.has(tx.id) ? { borderColor: "var(--accent-border, rgba(45,212,191,0.25))" } : undefined}>
                  <div className={styles.txmHead}>
                    <span className={styles.txmName} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selected.has(tx.id)}
                        onChange={() => toggleRow(tx.id)}
                        aria-label="Selecionar venda"
                        style={{ cursor: "pointer", accentColor: "var(--accent)" }}
                      />
                      {tx.userName || "Cliente"}
                    </span>
                    <span className={styles.txmAmount}>{fmtMoney(tx.amount)}</span>
                  </div>
                  <div className={styles.txmTags}>
                    {tx.isRenewal ? <Badge variant="info" size="sm">Renovação</Badge> : <Badge variant="success" size="sm">Nova</Badge>}
                    {tx.isCloseFriends && <span className={styles.cfTag} title="Close Friends">★ CF</span>}
                    {statusBadge(tx.status)}
                    {tx.coproducer && (
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "rgba(168,85,247,0.12)", color: "#a855f7", fontWeight: 600 }}>
                        {tx.coproducer.displayName || tx.coproducer.user.name}
                      </span>
                    )}
                  </div>
                  <div className={styles.txmRow}><span className={styles.txmLabel}>Data</span><span className={styles.txmValue}>{fmtDateTime(tx.createdAt)}</span></div>
                  <div className={styles.txmRow}><span className={styles.txmLabel}>Método</span><span className={styles.txmValue}>{tx.paymentMethod || "M-Pesa"}{tx.gateway && tx.gateway !== "lojou" ? ` · ${tx.gateway.toUpperCase()}` : ""}</span></div>
                  <div className={styles.txmRow}><span className={styles.txmLabel}>Bruto</span><span className={styles.txmValue}>{tx.grossAmount != null ? fmtMoney(tx.grossAmount) : "—"}</span></div>
                  <div className={styles.txmRow}><span className={styles.txmLabel}>Taxa Lojou</span><span className={styles.txmValue}>{tx.lojouFee != null ? `−${fmtMoney(tx.lojouFee)}` : "—"}</span></div>
                  {tx.coproducerFee != null && tx.coproducerFee > 0 && (
                    <div className={styles.txmRow}><span className={styles.txmLabel}>Split coprod.</span><span className={styles.txmValue}>−{fmtMoney(tx.coproducerFee)}</span></div>
                  )}
                </div>
              ))}
            </div>
            </>
          ) : loading ? (
            <div className={styles.empty}>Carregando…</div>
          ) : (
            <div className={styles.empty}>Nenhuma transação no período.</div>
          )}
        </div>

        {data && data.transactions.total > limit && (
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >‹ Anterior</button>
            <span className={styles.pageInfo}>
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >Próxima ›</button>
          </div>
        )}
      </div>

      {/* ── Funnel injection modal ──────────────────────────── */}
      {injectOpen && (
        <div
          onClick={() => !injecting && setInjectOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 460, background: "var(--bg-surface, #111)", border: "1px solid var(--border-default)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 16, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: 8 }}><IconFunnel /> Infectar funil</h3>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                {selected.size} venda(s) selecionada(s). Cada contato entra no funil já com os dados do quiz (objetivo, dor, etc.), em segundo plano e com intervalo aleatório entre os envios.
              </p>
            </div>

            <label style={modalLabel}>
              <span style={modalLabelTitle}>Funil do Komunika</span>
              <select value={injectFunnel} onChange={(e) => setInjectFunnel(e.target.value)} style={{ ...modalField, cursor: "pointer" }}>
                <option value="">— selecione um funil —</option>
                {funnels.map((f) => (
                  <option key={funnelKey(f)} value={funnelKey(f)}>{funnelLabel(f)}</option>
                ))}
              </select>
              {funnelsError && (
                <span style={{ fontSize: 11, color: "var(--color-warning)" }}>{funnelsError} Cole um ID abaixo.</span>
              )}
            </label>

            <label style={modalLabel}>
              <span style={modalLabelTitle}>…ou cole o ID do funil</span>
              <input value={injectFunnelManual} onChange={(e) => setInjectFunnelManual(e.target.value)} placeholder="ID do funil no Komunika" style={modalField} />
            </label>

            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ ...modalLabel, flex: 1 }}>
                <span style={modalLabelTitle}>Intervalo mín (s)</span>
                <input type="number" min={0} value={intMin} onChange={(e) => setIntMin(Math.max(0, Number(e.target.value)))} style={modalField} />
              </label>
              <label style={{ ...modalLabel, flex: 1 }}>
                <span style={modalLabelTitle}>Intervalo máx (s)</span>
                <input type="number" min={0} value={intMax} onChange={(e) => setIntMax(Math.max(0, Number(e.target.value)))} style={modalField} />
              </label>
            </div>

            {injectMsg && (
              <div style={{ fontSize: 13, lineHeight: 1.5, color: injectMsg.startsWith("✅") ? "var(--accent)" : "var(--color-error)" }}>{injectMsg}</div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                disabled={injecting}
                onClick={() => setInjectOpen(false)}
                style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={injecting}
                onClick={submitInject}
                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "var(--accent)", color: "var(--accent-fg, #001412)", fontSize: 13, fontWeight: 700, cursor: injecting ? "default" : "pointer", opacity: injecting ? 0.7 : 1 }}
              >
                {injecting ? "Disparando…" : "Disparar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
