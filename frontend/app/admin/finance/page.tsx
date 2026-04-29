"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
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
  chartData: { date: string; amount: number }[];
  recentTransactions: any[];
}

export default function AdminFinance() {
  const router = useRouter();
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    fetchFinanceData();
  }, [period]);

  const fetchFinanceData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("cz_token");
      if (!token) {
        router.push("/login");
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/finance?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Erro ao buscar dados financeiros");

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-MZ", {
      style: "currency",
      currency: "MZN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const renderGrowth = (value: number) => {
    const isPositive = value > 0;
    const isNegative = value < 0;
    const isZero = value === 0;
    
    let colorClass = styles.growthNeutral;
    let icon = "—";
    
    if (isPositive) { colorClass = styles.growthPositive; icon = "↗"; }
    if (isNegative) { colorClass = styles.growthNegative; icon = "↘"; }

    return (
      <span className={`${styles.metricGrowth} ${colorClass}`}>
        {icon} {Math.abs(value).toFixed(1)}% vs período anterior
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className={styles.page}>
        <div className={styles.loader}>
          <svg width="32" height="32" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" className="animate-spin">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m0 14v1m8-8h1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
          </svg>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Financeiro</h1>
          <p className={styles.subtitle}>Acompanhamento de receitas e métricas de vendas.</p>
        </div>
        
        <select 
          className={styles.periodSelect}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          disabled={loading}
        >
          <option value="7d">Últimos 7 dias</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="12m">Últimos 12 meses</option>
        </select>
      </header>

      {/* Metrics */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <div className={styles.metricIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="1" x2="12" y2="23"></line>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
              </svg>
            </div>
            Faturamento Total
          </div>
          <h3 className={styles.metricValue}>{formatCurrency(data?.metrics.revenue || 0)}</h3>
          {renderGrowth(data?.metrics.revenueGrowth || 0)}
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <div className={styles.metricIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
            </div>
            Vendas Aprovadas
          </div>
          <h3 className={styles.metricValue}>{data?.metrics.count || 0}</h3>
          {renderGrowth(data?.metrics.countGrowth || 0)}
        </div>

        <div className={styles.metricCard}>
          <div className={styles.metricHeader}>
            <div className={styles.metricIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
            </div>
            Ticket Médio
          </div>
          <h3 className={styles.metricValue}>{formatCurrency(data?.metrics.ticket || 0)}</h3>
          {renderGrowth(data?.metrics.ticketGrowth || 0)}
        </div>
      </div>

      {/* Chart */}
      <div className={styles.chartCard}>
        <div className={styles.chartHeader}>
          <h2 className={styles.chartTitle}>Evolução da Receita</h2>
        </div>
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height="100%">
            {period === '12m' ? (
              <BarChart data={data?.chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="var(--text-tertiary)" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `MT ${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                />
                <Tooltip 
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                  contentStyle={{ backgroundColor: 'var(--bg-glass)', borderColor: 'var(--border-default)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: 'var(--accent-amber)' }}
                  formatter={(value: any) => [formatCurrency(value as number), 'Receita']}
                />
                <Bar dataKey="amount" fill="var(--accent-amber)" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={data?.chartData || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis 
                  stroke="var(--text-tertiary)" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(val) => `MT ${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-glass)', borderColor: 'var(--border-default)', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: 'var(--accent-amber)' }}
                  formatter={(value: any) => [formatCurrency(value as number), 'Receita']}
                />
                <Line type="monotone" dataKey="amount" stroke="var(--accent-amber)" strokeWidth={3} dot={{ r: 4, fill: "var(--bg-dark)", stroke: "var(--accent-amber)", strokeWidth: 2 }} activeDot={{ r: 6, fill: "var(--accent-amber)", stroke: "#fff", strokeWidth: 2 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transactions Table */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h2 className={styles.tableTitle}>Transações Recentes</h2>
        </div>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Data</th>
                <th>Método</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.recentTransactions && data.recentTransactions.length > 0 ? (
                data.recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <div className={styles.userName}>{tx.userName || "Cliente"}</div>
                      <div className={styles.userEmail}>{tx.userEmail || "Sem email"}</div>
                    </td>
                    <td>{new Date(tx.createdAt).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td style={{ textTransform: "capitalize" }}>{tx.paymentMethod || "M-Pesa"}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(tx.amount)}</td>
                    <td>
                      <span className={`${styles.badge} ${tx.status === 'approved' ? styles.badgeApproved : tx.status === 'failed' ? styles.badgeFailed : styles.badgePending}`}>
                        {tx.status === 'approved' ? "Aprovado" : tx.status === 'failed' ? "Falhou" : "Pendente"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "var(--text-tertiary)" }}>
                    Nenhuma transação encontrada neste período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
