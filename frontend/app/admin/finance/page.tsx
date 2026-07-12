"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  AdminPage,
  MetricCard,
  RevenueChart,
  Section,
  DataTable,
  StatusBadge,
  SearchInput,
  type Period as ChartPeriod,
  type Column,
} from "@/components/admin";
import k from "@/components/admin/kit.module.css";
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
  initiatedCount?: number;
  initiatedAmount?: number;
  costsTotal?: number;
  costsCompany?: number;
  costsShared?: number;
  profit?: number;
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
  chartData: { date: string; amount: number; new: number; renewal: number; newCount: number; renewalCount: number }[];
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
const IconCost = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);

/** Status da transação → StatusBadge do kit, preservando os rótulos do financeiro
 *  (failed/cancelled = "Cancelada"; pending = "Pendente"). */
const txStatusBadge = (s: string) => {
  if (s === "approved") return <StatusBadge tone="good">Aprovada</StatusBadge>;
  if (s === "refunded") return <StatusBadge tone="neutral">Reembolsada</StatusBadge>;
  if (s === "failed" || s === "cancelled" || s === "canceled") return <StatusBadge tone="danger">Cancelada</StatusBadge>;
  return <StatusBadge tone="warn">Pendente</StatusBadge>;
};

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "12m", label: "12 meses" },
  { value: "custom", label: "Personalizado" },
];

// Grade herói: 4 KPIs numa fileira (auto-fit, responsiva sem media query).
const heroGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: "var(--grid-gap)",
};

// Map our extended period to what RevenueChart accepts internally
const toChartPeriod = (p: Period): ChartPeriod =>
  p === "12m" ? "12m" : p === "7d" ? "7d" : "30d";

/** Título enxuto acima de uma tabela (o kit não expõe tabela com título). */
function TableHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, margin: "2px 2px 0" }}>
      <h2 style={{ fontSize: "0.95rem", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-primary)", margin: 0 }}>{children}</h2>
      {right != null && <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{right}</span>}
    </div>
  );
}

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

  const [search, setSearch] = useState("");

  const [page, setPage] = useState(1);
  const limit = 10;

  const [upcoming, setUpcoming] = useState<UpcomingUser[]>([]);
  // "Próximas renovações" vem inteira do backend; paginamos no cliente, 10/página.
  const [upcomingPage, setUpcomingPage] = useState(1);
  const upcomingLimit = 10;
  const upcomingTotalPages = Math.max(1, Math.ceil(upcoming.length / upcomingLimit));
  const upcomingClamped = Math.min(upcomingPage, upcomingTotalPages);
  const upcomingSlice = upcoming.slice((upcomingClamped - 1) * upcomingLimit, upcomingClamped * upcomingLimit);

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("cz_token");
    if (!token) {
      router.push("/login");
      return;
    }
    setLoading(true);
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
        fetch(`${API_URL}/api/admin/finance/upcoming-renewals?days=30&limit=100`, {
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

  const [exporting, setExporting] = useState(false);

  // Export the transactions matching the current filters as CSV. The route is
  // auth-gated, so we fetch with the Bearer header → blob → trigger download
  // (no raw URL navigation). Passes the same window/source/type/status/search
  // params as fetchData() so the file matches what's on screen.
  const exportCsv = useCallback(async () => {
    const token = localStorage.getItem("cz_token");
    if (!token) {
      router.push("/login");
      return;
    }
    const params = new URLSearchParams({ period, source });
    if (txType !== "all") params.set("txType", txType);
    if (txStatus !== "all") params.set("txStatus", txStatus);
    if (search) params.set("search", search);
    if (period === "custom" && from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/finance/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `financeiro-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }, [period, source, txType, txStatus, search, from, to, router]);

  const chartWithCount = useMemo(
    () =>
      (data?.chartData || []).map((d) => ({
        date: d.date,
        amount: d.amount,
        // RevenueChart treats `count` as bars — repurpose for renewals split
        count: d.renewal,
        // Real transaction counts for the tooltip (new vs renewal).
        newCount: d.newCount,
        renewalCount: d.renewalCount,
      })),
    [data],
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.transactions.total / limit)) : 1;
  const realizedPctLabel = data?.metrics.renewalRate != null
    ? `${data.metrics.renewalRate.toFixed(0)}% renovaram`
    : "—";

  // Setters de filtro que resetam a paginação para a página 1 (busca única).
  const onSearch = (v: string) => { setSearch(v); setPage(1); };
  const onPeriod = (p: Period) => { setPeriod(p); setPage(1); };
  const onSource = (v: string) => { setSource(v); setPage(1); };
  const onTxType = (v: string) => { setTxType(v); setPage(1); };
  const onTxStatus = (v: string) => { setTxStatus(v); setPage(1); };

  const skeleton = loading && !data;

  // ── Colunas: transações ────────────────────────────────────────────────
  const txColumns: Column<Tx>[] = [
    {
      key: "cliente", header: "Cliente", primaryOnMobile: true,
      render: (tx) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{tx.userName || "Cliente"}</span>
          <span className={k.cellSub}>{tx.userEmail || tx.userPhone || "—"}</span>
        </div>
      ),
    },
    {
      key: "tipo", header: "Tipo", mobileLabel: "Tipo",
      render: (tx) => (
        <span className={k.cellInline}>
          {tx.isRenewal ? <StatusBadge tone="info" noDot>Renovação</StatusBadge> : <StatusBadge tone="good" noDot>Nova</StatusBadge>}
          {tx.isCloseFriends && <span className={styles.cfTag} title="Close Friends">★ CF</span>}
        </span>
      ),
    },
    {
      key: "origem", header: "Origem", mobileLabel: "Origem",
      render: (tx) =>
        tx.coproducer
          ? <StatusBadge tone="accent" noDot>{tx.coproducer.displayName || tx.coproducer.user.name}</StatusBadge>
          : <span className={k.cellMuted}>Principal</span>,
    },
    {
      key: "data", header: "Data", mobileLabel: "Data",
      render: (tx) => (
        <div className={k.cellStack}>
          <span>{fmtDateTime(tx.createdAt)}</span>
          <span className={k.cellSub}>
            {tx.paymentMethod || "M-Pesa"}
            {tx.gateway && tx.gateway !== "lojou" ? ` · ${tx.gateway.toUpperCase()}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "bruto", header: "Bruto", align: "right", mono: true, mobileLabel: "Bruto",
      render: (tx) => (
        <>
          {tx.grossAmount != null ? fmtMoney(tx.grossAmount) : "—"}
          {tx.orderBumpAmount ? <div className={k.cellSub}>incl. bump {fmtMoney(tx.orderBumpAmount)}</div> : null}
        </>
      ),
    },
    {
      key: "taxa", header: "Taxa Lojou", align: "right", mono: true, muted: true, mobileLabel: "Taxa Lojou",
      render: (tx) => (tx.lojouFee != null ? `−${fmtMoney(tx.lojouFee)}` : "—"),
    },
    {
      key: "split", header: "Split coprod.", align: "right", mono: true, mobileLabel: "Split coprod.",
      render: (tx) =>
        tx.coproducerFee != null && tx.coproducerFee > 0
          ? <span style={{ color: "var(--accent)" }}>−{fmtMoney(tx.coproducerFee)}</span>
          : <span className={k.cellMuted}>—</span>,
    },
    {
      key: "liquido", header: "Líquido", align: "right", mono: true, mobileLabel: "Líquido",
      render: (tx) => <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{fmtMoney(tx.amount)}</span>,
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (tx) => txStatusBadge(tx.status),
    },
  ];

  // ── Colunas: próximas renovações ───────────────────────────────────────
  const upcomingColumns: Column<UpcomingUser>[] = [
    {
      key: "cliente", header: "Cliente", primaryOnMobile: true,
      render: (u) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>
            {u.name || "Membro"}
            {u.closeFriends && <span className={styles.cfTag} title="Close Friends">★ CF</span>}
          </span>
          <span className={k.cellSub}>{u.email}</span>
        </div>
      ),
    },
    { key: "phone", header: "Telefone", mono: true, mobileLabel: "Telefone", render: (u) => u.phone || "—" },
    { key: "expira", header: "Expira em", muted: true, mobileLabel: "Expira em", render: (u) => fmtDate(u.subscriptionEnd) },
    {
      key: "dias", header: "Dias", align: "right", mobileLabel: "Dias restantes",
      render: (u) => (
        <span className={`${styles.daysLeft} ${u.daysUntilExpiry != null && u.daysUntilExpiry <= 3 ? styles.daysLeftUrgent : ""}`}>
          {u.daysUntilExpiry ?? "—"}d
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="Financeiro"
      actions={
        <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={exportCsv} disabled={exporting}>
          {exporting ? "Exportando…" : "Exportar CSV"}
        </button>
      }
    >
      {/* ── Filtros (período / origem / busca) — governam KPIs, gráfico e lista ── */}
      <div className={styles.filtersCard}>
        <div className={styles.periodChips}>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.periodChip} ${period === opt.value ? styles.periodChipActive : ""}`}
              onClick={() => onPeriod(opt.value)}
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

        <SearchInput defaultValue={search} onSearch={onSearch} placeholder="Buscar por nome, e-mail ou telefone…" />

        <select className={k.select} value={source} onChange={(e) => onSource(e.target.value)} aria-label="Origem">
          <option value="all">Origem: Todas</option>
          <option value="principal">Origem: Principal</option>
          {coproducers.map((c) => (
            <option key={c.id} value={c.id}>Origem: {c.displayName || c.user.name}</option>
          ))}
        </select>
      </div>

      {/* ── Fileira herói (4 KPIs primários) ── */}
      <div style={heroGrid}>
        <MetricCard
          accent
          label="Faturamento"
          value={data ? fmtMoney(data.metrics.revenue) : undefined}
          loading={skeleton}
          icon={<IconRevenue />}
          iconAccent
          delta={data?.metrics.revenueGrowth ?? null}
          sub="vs período anterior"
          sparkline={(data?.chartData ?? []).length > 1 ? data!.chartData.map((d) => ({ value: d.amount })) : undefined}
        />
        <MetricCard
          accent
          label="Lucro líquido"
          value={data ? fmtMoney(data.metrics.profit ?? 0) : undefined}
          loading={skeleton}
          icon={<IconRevenue />}
          iconAccent
          sub="receita líquida − custos"
        />
        <MetricCard
          label="MRR ativo"
          value={data ? fmtMoney(data.metrics.mrr) : undefined}
          loading={skeleton}
          icon={<IconUsers />}
          iconAccent
          sub={data ? `${data.metrics.activePaidUsers} assinantes ativos` : ""}
        />
        <MetricCard
          label="Ticket médio"
          value={data ? fmtMoney(data.metrics.ticket) : undefined}
          loading={skeleton}
          icon={<IconBolt />}
          iconAccent
          delta={data?.metrics.ticketGrowth ?? null}
          sub="vs período anterior"
        />
      </div>

      {/* ── Tira secundária (vendas / renovações) ── */}
      <div className={styles.metricsGrid}>
        <MetricCard
          label="Novas vendas"
          value={data ? data.metrics.newCount.toLocaleString("pt-MZ") : undefined}
          loading={skeleton}
          icon={<IconNew />}
          iconAccent
          sub={data ? `${fmtMoney(data.metrics.newRevenue)} no período` : ""}
        />
        <MetricCard
          label="Renovações"
          value={data ? data.metrics.renewalCount.toLocaleString("pt-MZ") : undefined}
          loading={skeleton}
          icon={<IconRenew />}
          iconAccent
          sub={data ? `${fmtMoney(data.metrics.renewalRevenue)} no período` : ""}
        />
        <MetricCard
          label="Taxa de renovação"
          value={data?.metrics.renewalRate != null ? `${data.metrics.renewalRate.toFixed(0)}%` : "—"}
          loading={skeleton}
          icon={<IconChurn />}
          iconAccent
          sub={data ? `${data.metrics.realizedRenewals}/${data.metrics.expectedRenewals} esperadas` : ""}
        />
      </div>

      {/* ── Taxas & perdas (colapsável, secundário) ── */}
      <Section title="Taxas & perdas" defaultOpen={false}>
        <div className={styles.metricsGrid}>
          <MetricCard
            label="Faturamento bruto"
            value={data?.metrics.grossRevenue != null ? fmtMoney(data.metrics.grossRevenue) : undefined}
            loading={skeleton}
            icon={<IconRevenue />}
            sub="antes de taxa Lojou e split"
          />
          <MetricCard
            label="Taxa Lojou"
            value={data?.metrics.totalLojouFee != null ? fmtMoney(data.metrics.totalLojouFee) : undefined}
            loading={skeleton}
            icon={<IconBolt />}
            sub="10% + 10 MT por item"
          />
          <MetricCard
            label="Split coprodutores"
            value={data?.metrics.totalCoproducerFee != null ? fmtMoney(data.metrics.totalCoproducerFee) : undefined}
            loading={skeleton}
            icon={<IconUsers />}
            sub="split sobre o principal"
          />
          <MetricCard
            label="Reembolsos"
            value={data ? (data.metrics.refundedCount ?? 0).toLocaleString("pt-MZ") : undefined}
            loading={skeleton}
            icon={<IconRefund />}
            sub={data ? `${fmtMoney(data.metrics.refundedAmount ?? 0)} no período` : ""}
          />
          <MetricCard
            label="Pagamento iniciado"
            value={data ? (data.metrics.initiatedCount ?? 0).toLocaleString("pt-MZ") : undefined}
            loading={skeleton}
            icon={<IconCancel />}
            sub={data ? `${fmtMoney(data.metrics.initiatedAmount ?? 0)} — checkout não concluído` : ""}
          />
          <MetricCard
            label="Custos"
            value={data ? fmtMoney(data.metrics.costsTotal ?? 0) : undefined}
            loading={skeleton}
            icon={<IconCost />}
            sub={data ? `${fmtMoney(data.metrics.costsShared ?? 0)} rateados · ${fmtMoney(data.metrics.costsCompany ?? 0)} empresa` : ""}
          />
        </div>
      </Section>

      {/* ── Gráfico ── */}
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

      {/* ── Próximas renovações ── */}
      {upcoming.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <TableHeading right={`${upcoming.length} usuários`}>Próximas renovações · 30 dias</TableHeading>
          <DataTable
            columns={upcomingColumns}
            rows={upcomingSlice}
            getRowKey={(u) => u.id}
            empty={{ title: "Nenhuma renovação próxima" }}
            pagination={{
              page: upcomingClamped,
              totalPages: upcomingTotalPages,
              total: upcoming.length,
              pageSize: upcomingLimit,
              onChange: setUpcomingPage,
            }}
          />
        </div>
      )}

      {/* ── Transações ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <TableHeading>Transações</TableHeading>
        <DataTable
          columns={txColumns}
          rows={data?.transactions.items ?? []}
          getRowKey={(t) => t.id}
          loading={skeleton}
          empty={{ title: "Nenhuma transação no período.", desc: "Ajuste o período ou os filtros." }}
          pagination={{
            page,
            totalPages,
            total: data?.transactions.total ?? 0,
            pageSize: limit,
            onChange: setPage,
          }}
          toolbar={
            <>
              <select className={k.select} value={txType} onChange={(e) => onTxType(e.target.value)} aria-label="Tipo">
                <option value="all">Tipo: Todos</option>
                <option value="new">Novas</option>
                <option value="renewal">Renovações</option>
                <option value="closeFriends">Close Friends</option>
              </select>
              <select className={k.select} value={txStatus} onChange={(e) => onTxStatus(e.target.value)} aria-label="Status">
                <option value="all">Status: Todos</option>
                <option value="approved">Aprovadas</option>
                <option value="refunded">Reembolsadas</option>
                <option value="failed">Canceladas</option>
                <option value="pending">Pagamento iniciado</option>
              </select>
            </>
          }
        />
      </div>
    </AdminPage>
  );
}
