"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { MetricCard, RevenueChart, type Period, type RevenueDatum } from "@/components/admin";
import adminStyles from "../admin.module.css";
import styles from "./finance.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface FinanceData {
  metrics: {
    revenue: number;
    revenueGrowth: number;
    ticket: number;
    ticketGrowth: number;
    count: number;
    countGrowth: number;
  };
  chartData: (RevenueDatum & { count?: number })[];
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

const IconRevenue = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
  </svg>
);
const IconCart = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
  </svg>
);
const IconBolt = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const statusBadge = (s: string) => {
  if (s === "approved") return <Badge variant="success" size="sm">Aprovada</Badge>;
  if (s === "failed")   return <Badge variant="error"   size="sm">Falhou</Badge>;
  return <Badge variant="warning" size="sm">Pendente</Badge>;
};

export default function AdminFinance() {
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const token = localStorage.getItem("cz_token");
      if (!token) {
        router.push("/login");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/admin/finance?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Erro ao buscar dados");
        const json: FinanceData = await res.json();
        if (alive) setData(json);
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [period, router]);

  // Augment chart data with daily transaction count (split current period into buckets)
  const chartWithCounts = useMemo(() => {
    if (!data) return [];
    const counts = new Map<string, number>();
    for (const tx of data.recentTransactions) {
      const d = new Date(tx.createdAt);
      const key = period === "12m"
        ? d.toLocaleString("pt-MZ", { month: "short", year: "2-digit" })
        : d.toLocaleDateString("pt-MZ", { day: "2-digit", month: "2-digit" });
      counts.set(key, (counts.get(key) || 0) + (tx.status === "approved" ? 1 : 0));
    }
    return data.chartData.map((d) => ({ ...d, count: counts.get(d.date) ?? 0 }));
  }, [data, period]);

  return (
    <div className={styles.page}>
      <div className={adminStyles.pageHeader}>
        <h1 className={adminStyles.pageTitle}>Financeiro</h1>
        <p className={adminStyles.pageDesc}>
          Receita, ticket médio, vendas aprovadas — comparados ao período anterior.
        </p>
      </div>

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
          label="Vendas aprovadas"
          value={data ? data.metrics.count.toLocaleString("pt-BR") : undefined}
          loading={loading && !data}
          icon={<IconCart />}
          iconAccent
          delta={data?.metrics.countGrowth ?? null}
          sub="vs período anterior"
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
      </div>

      <RevenueChart
        data={chartWithCounts}
        period={period}
        onPeriodChange={setPeriod}
        total={data?.metrics.revenue}
        delta={data?.metrics.revenueGrowth ?? null}
        title="Evolução da receita"
        eyebrow="Receita · transações"
        loading={loading}
        showCount
        formatCurrency={fmtMoney}
      />

      <div className={styles.txCard}>
        <div className={styles.txHead}>
          <span className={styles.txTitle}>Transações recentes</span>
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            {data?.recentTransactions.length || 0} registros
          </span>
        </div>

        <div className={styles.txWrap}>
          {data?.recentTransactions.length ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Data</th>
                  <th>Método</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <div className={styles.client}>
                        <span className={styles.clientName}>{tx.userName || "Cliente"}</span>
                        <span className={styles.clientEmail}>{tx.userEmail || "—"}</span>
                      </div>
                    </td>
                    <td>
                      {new Date(tx.createdAt).toLocaleDateString("pt-MZ", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <span className={styles.method}>{tx.paymentMethod || "M-Pesa"}</span>
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
            <div className={styles.empty}>Nenhuma transação registrada no período.</div>
          )}
        </div>
      </div>
    </div>
  );
}
