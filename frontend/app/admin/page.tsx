"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { MetricCard, RevenueChart, type Period, type RevenueDatum } from "@/components/admin";
import adminStyles from "./admin.module.css";
import styles from "./dashboard.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

interface Stats {
  totalUsers: number;
  activeUsers: number;
  leads: number;
  paidUsers: number;
  totalRevenue: number;
  mrr: number;
  vagasRestantes: number | string;
  totalScripts: number;
  totalModules: number;
  totalLessons: number;
}

interface FinanceMetrics {
  revenue: number;
  revenueGrowth: number;
  ticket: number;
  ticketGrowth: number;
  count: number;
  countGrowth: number;
}

interface FinanceData {
  metrics: FinanceMetrics;
  chartData: RevenueDatum[];
  recentTransactions: Tx[];
}

interface Tx {
  id: string;
  userName?: string | null;
  userEmail?: string | null;
  amount: number;
  status: string;
  paymentMethod?: string | null;
  createdAt: string;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", {
    style: "currency",
    currency: "MZN",
    maximumFractionDigits: 0,
  }).format(n);

const fmtNumber = (n: number) => n.toLocaleString("pt-BR");

const fmtRelative = (iso: string) => {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const h = diff / (1000 * 60 * 60);
  if (h < 1) return `${Math.floor(diff / 60000)} min`;
  if (h < 24) return `${Math.floor(h)} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} d`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
};

const IconUsers = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 00-3-3.87" />
  </svg>
);
const IconCoin = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M9 10c0-1.7 1.3-2 3-2s3 .8 3 2-1.3 2-3 2-3 .8-3 2 1.3 2 3 2 3-.3 3-2" />
  </svg>
);
const IconBolt = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const IconChart = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="21" x2="21" y2="21" />
    <rect x="6" y="13" width="3" height="6" />
    <rect x="11" y="9" width="3" height="10" />
    <rect x="16" y="5" width="3" height="14" />
  </svg>
);
const IconLessons = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
);
const IconScripts = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="9" y1="13" x2="15" y2="13" />
  </svg>
);
const IconLeads = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconSlots = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1l3 5 6 1-4.5 4.5L18 18l-6-3-6 3 1.5-6.5L3 7l6-1z" />
  </svg>
);

const formatDateAxis = (period: Period) => (raw: string) => {
  if (period === "12m") return raw; // already "mai/26" style
  // raw is "dd/mm" — keep
  return raw;
};

const statusBadge = (s: string) => {
  if (s === "approved") return <Badge variant="success" size="sm">Aprovada</Badge>;
  if (s === "failed")   return <Badge variant="error"   size="sm">Falhou</Badge>;
  return <Badge variant="warning" size="sm">Pendente</Badge>;
};

export default function AdminDashboard() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [period, setPeriod]   = useState<Period>("30d");
  const [loadingFin, setLoadingFin] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/admin/stats`, { headers: hdr() })
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoadingFin(true);
    fetch(`${API}/api/admin/finance?period=${period}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setFinance(d);
      })
      .catch(console.error)
      .finally(() => alive && setLoadingFin(false));
    return () => {
      alive = false;
    };
  }, [period]);

  // Sparkline for MRR card based on chart data
  const sparkline = useMemo(
    () => finance?.chartData.map((d) => ({ value: d.amount })) ?? [],
    [finance]
  );

  return (
    <div className={styles.page}>
      <div className={adminStyles.pageHeader}>
        <h1 className={adminStyles.pageTitle}>Visão geral</h1>
        <p className={adminStyles.pageDesc}>
          O coração da operação. Métricas em tempo real, receita, atividade dos últimos dias e saúde da plataforma.
        </p>
      </div>

      {/* ─── Primary KPIs ─── */}
      <div className={styles.metricsPrimary}>
        <MetricCard
          accent
          label="MRR"
          value={stats ? fmtMoney(stats.mrr) : undefined}
          loading={!stats}
          icon={<IconCoin />}
          iconAccent
          sub="receita mensal recorrente"
          sparkline={sparkline.length > 1 ? sparkline : undefined}
        />
        <MetricCard
          label="Pagos · ativos"
          value={stats ? fmtNumber(stats.paidUsers) : undefined}
          loading={!stats}
          icon={<IconUsers />}
          iconAccent
          sub="membros que pagam hoje"
          delta={finance?.metrics?.countGrowth ?? null}
        />
        <MetricCard
          label="Receita do período"
          value={finance ? fmtMoney(finance.metrics.revenue) : undefined}
          loading={loadingFin}
          icon={<IconBolt />}
          iconAccent
          sub={`últimos ${period === "7d" ? "7 dias" : period === "30d" ? "30 dias" : "12 meses"}`}
          delta={finance?.metrics?.revenueGrowth ?? null}
        />
        <MetricCard
          label="Receita total"
          value={stats ? fmtMoney(stats.totalRevenue) : undefined}
          loading={!stats}
          icon={<IconChart />}
          iconAccent
          sub="histórico desde o início"
        />
      </div>

      {/* ─── Revenue chart ─── */}
      <RevenueChart
        data={finance?.chartData ?? []}
        period={period}
        onPeriodChange={setPeriod}
        total={finance?.metrics.revenue}
        delta={finance?.metrics.revenueGrowth ?? null}
        title="Evolução da receita"
        eyebrow="Receita"
        loading={loadingFin}
        formatCurrency={fmtMoney}
        formatDate={formatDateAxis(period)}
      />

      {/* ─── Secondary KPIs ─── */}
      <span className={styles.sectionTitle}>Operação</span>
      <div className={styles.metricsSecondary}>
        <MetricCard
          label="Total de usuários"
          value={stats ? fmtNumber(stats.totalUsers) : undefined}
          loading={!stats}
          icon={<IconUsers />}
          sub="incluindo cancelados"
        />
        <MetricCard
          label="Leads"
          value={stats ? fmtNumber(stats.leads) : undefined}
          loading={!stats}
          icon={<IconLeads />}
          sub="captados em landing + radar"
        />
        <MetricCard
          label="Aulas publicadas"
          value={stats ? `${stats.totalLessons}` : undefined}
          suffix={stats ? `· ${stats.totalModules} módulos` : undefined}
          loading={!stats}
          icon={<IconLessons />}
          sub="conteúdo na Forja"
        />
        <MetricCard
          label="Scripts no Cofre"
          value={stats ? fmtNumber(stats.totalScripts) : undefined}
          loading={!stats}
          icon={<IconScripts />}
          sub="biblioteca dos membros"
        />
      </div>

      {/* Vagas — full row when set */}
      {stats && typeof stats.vagasRestantes !== "string" && (
        <div className={styles.metricsPrimary}>
          <MetricCard
            label="Vagas restantes"
            value={fmtNumber(stats.vagasRestantes as number)}
            icon={<IconSlots />}
            iconAccent
            sub="para a turma atual"
          />
        </div>
      )}

      {/* ─── Activity feed ─── */}
      <div className={styles.activityCard}>
        <div className={styles.activityHead}>
          <h3 className={styles.activityTitle}>Atividade recente</h3>
          {finance && (
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {finance.recentTransactions.length} transação(ões)
            </span>
          )}
        </div>
        <div className={styles.activityList}>
          {loadingFin && !finance ? (
            <div className={styles.activityEmpty}>Carregando…</div>
          ) : finance?.recentTransactions.length ? (
            finance.recentTransactions.slice(0, 8).map((tx) => (
              <div key={tx.id} className={styles.activityRow}>
                <div className={styles.activityName}>
                  <span className={styles.activityNameMain}>{tx.userName || "Cliente"}</span>
                  <span className={styles.activityNameSub}>{tx.userEmail || tx.id}</span>
                </div>
                <span className={styles.activityAmount}>{fmtMoney(tx.amount)}</span>
                {statusBadge(tx.status)}
                <span className={styles.activityDate}>{fmtRelative(tx.createdAt)}</span>
              </div>
            ))
          ) : (
            <div className={styles.activityEmpty}>Nenhuma transação registrada ainda.</div>
          )}
        </div>
      </div>
    </div>
  );
}
