"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../coproducer.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

type Period = "today" | "7d" | "30d" | "12m" | "custom";

interface FinanceData {
  metrics: {
    revenue: number;
    revenueGrowth: number;
    count: number;
    countGrowth: number;
    ticket: number;
    newCount: number;
    newRevenue: number;
    renewalCount: number;
    renewalRevenue: number;
    yourShareRevenue: number;
    sharePct: number;
    activePaidUsers: number;
    renewalRate: number | null;
    expectedRenewals: number;
    realizedRenewals: number;
  };
  transactions: { total: number; page: number; limit: number; items: Tx[] };
}

interface Tx {
  id: string;
  orderId: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  amount: number;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
  isRenewal: boolean;
  isCloseFriends: boolean;
  orderBumpAmount: number | null;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "12m", label: "12 meses" },
  { value: "custom", label: "Personalizado" },
];

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-MZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function CoproducerFinance() {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const limit = 25;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchInput]);

  const load = useCallback(async () => {
    if (period === "custom" && (!from || !to)) return;
    setLoading(true);
    const params = new URLSearchParams({ period, page: String(page), limit: String(limit) });
    if (search) params.set("search", search);
    if (period === "custom") { params.set("from", from); params.set("to", to); }
    const r = await fetch(`${API}/api/coproducer/finance?${params}`, { headers: hdr() });
    if (r.ok) setData(await r.json());
    setLoading(false);
  }, [period, page, search, from, to]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.transactions.total / limit)) : 1;

  return (
    <div>
      <div className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Painel do coprodutor</span>
        <h1 className={styles.pageTitle}>Vendas</h1>
        <p className={styles.pageDesc}>
          Todas as vendas atribuídas ao seu link de coprodução, com filtros e busca.
        </p>
      </div>

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.periodChips}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => { setPeriod(p.value); setPage(1); }}
              className={`${styles.periodChip} ${period === p.value ? styles.periodChipActive : ""}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }}
              style={{ padding: "7px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, colorScheme: "dark" }} />
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }}
              style={{ padding: "7px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, color: "var(--text-primary)", fontSize: 13, colorScheme: "dark" }} />
          </>
        )}
        <input
          className={styles.searchInput}
          placeholder="Buscar por nome, email ou telefone…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {/* KPIs */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Faturamento</div>
          <div className={styles.statValue}>{data ? fmtMoney(data.metrics.revenue) : "—"}</div>
          <div className={styles.statSub}>{data ? `${data.metrics.count} vendas` : ""}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Sua parte ({data?.metrics.sharePct ?? "—"}%)</div>
          <div className={styles.statValue} style={{ color: "var(--accent)" }}>{data ? fmtMoney(data.metrics.yourShareRevenue) : "—"}</div>
          <div className={styles.statSub}>Estimativa · Lojou faz o split</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Novas</div>
          <div className={styles.statValue}>{data?.metrics.newCount ?? "—"}</div>
          <div className={styles.statSub}>{data ? fmtMoney(data.metrics.newRevenue) : ""}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Renovações</div>
          <div className={styles.statValue}>{data?.metrics.renewalCount ?? "—"}</div>
          <div className={styles.statSub}>{data ? fmtMoney(data.metrics.renewalRevenue) : ""}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Taxa de renovação</div>
          <div className={styles.statValue}>
            {data?.metrics.renewalRate != null ? `${data.metrics.renewalRate.toFixed(0)}%` : "—"}
          </div>
          <div className={styles.statSub}>{data ? `${data.metrics.realizedRenewals}/${data.metrics.expectedRenewals} esperadas` : ""}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Ticket médio</div>
          <div className={styles.statValue}>{data ? fmtMoney(data.metrics.ticket) : "—"}</div>
        </div>
      </div>

      {/* Transactions */}
      <div className={styles.tableCard}>
        <div className={styles.tableHead}>
          <span className={styles.tableTitle}>Transações</span>
          <span className={styles.tableHint}>
            {data ? `${data.transactions.items.length} de ${data.transactions.total}` : "—"}
          </span>
        </div>
        {data?.transactions.items.length ? (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Data</th>
                  <th>Método</th>
                  <th style={{ textAlign: "right" }}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{t.userName || "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{t.userEmail || t.userPhone}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, color: t.isRenewal ? "#3b82f6" : "#22c55e" }}>
                        {t.isRenewal ? "Renovação" : "Nova"}
                      </span>
                      {t.isCloseFriends && (
                        <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 999, fontSize: 9, fontWeight: 700, background: "linear-gradient(135deg, #f5d76e, #d4af37)", color: "#1a1100" }}>★ CF</span>
                      )}
                    </td>
                    <td style={{ color: "var(--text-tertiary)" }}>{fmtDateTime(t.createdAt)}</td>
                    <td style={{ textTransform: "uppercase", fontSize: 11, color: "var(--text-tertiary)" }}>{t.paymentMethod || "M-Pesa"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtMoney(t.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.transactions.total > limit && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 18px", borderTop: "1px solid var(--border-default)" }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                  style={{ padding: "6px 14px", borderRadius: 6, background: "var(--bg-glass)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: page <= 1 ? "not-allowed" : "pointer", opacity: page <= 1 ? 0.4 : 1 }}>
                  ‹ Anterior
                </button>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: "30px" }}>
                  Página {page} de {totalPages}
                </span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  style={{ padding: "6px 14px", borderRadius: 6, background: "var(--bg-glass)", border: "1px solid var(--border-default)", color: "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: page >= totalPages ? "not-allowed" : "pointer", opacity: page >= totalPages ? 0.4 : 1 }}>
                  Próxima ›
                </button>
              </div>
            )}
          </>
        ) : (
          <div className={styles.tableEmpty}>{loading ? "Carregando…" : "Nenhuma venda no período."}</div>
        )}
      </div>
    </div>
  );
}
