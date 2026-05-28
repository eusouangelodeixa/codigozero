"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const statusBadge = (s: string) => {
  if (s === "approved") return <Badge variant="success" size="sm">Aprovada</Badge>;
  if (s === "failed") return <Badge variant="error" size="sm">Falhou</Badge>;
  return <Badge variant="warning" size="sm">Pendente</Badge>;
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
  const [coproducers, setCoproducers] = useState<CoproducerOpt[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [page, setPage] = useState(1);
  const limit = 25;

  const [upcoming, setUpcoming] = useState<UpcomingUser[]>([]);

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
    try {
      const params = new URLSearchParams({
        period,
        page: String(page),
        limit: String(limit),
        source,
      });
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
  }, [period, page, search, from, to, source, router, coproducers.length]);

  useEffect(() => {
    // Don't trigger a custom-range fetch until both dates are set
    if (period === "custom" && (!from || !to)) return;
    fetchData();
  }, [fetchData, period, from, to]);

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
          </div>
        </div>
      )}

      {/* ── Transactions ────────────────────────────────────── */}
      <div className={styles.txCard}>
        <div className={styles.txHead}>
          <span className={styles.txTitle}>Transações</span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {data ? `${data.transactions.items.length} de ${data.transactions.total} registros` : "—"}
          </span>
        </div>

        <div className={styles.txWrap}>
          {data?.transactions.items.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Origem</th>
                  <th>Data</th>
                  <th>Método</th>
                  <th style={{ textAlign: "right" }}>Bruto</th>
                  <th style={{ textAlign: "right" }}>Taxa Lojou</th>
                  <th style={{ textAlign: "right" }}>Split coprod.</th>
                  <th style={{ textAlign: "right" }}>Líquido</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.items.map((tx) => (
                  <tr key={tx.id}>
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
                    <td><span className={styles.method}>{tx.paymentMethod || "M-Pesa"}</span></td>
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
    </div>
  );
}
