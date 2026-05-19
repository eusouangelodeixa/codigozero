"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, useToast } from "@/components/ui";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface AffiliateRow {
  id: string;
  code: string;
  enabled: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string; phone: string };
  payoutMethod: string | null;
  payoutTarget: string | null;
  stats: {
    paidReferrals: number;
    lostReferrals: number;
    pendingCommission: number;
    availableCommission: number;
    withdrawnCommission: number;
    totalPaidOut: number;
  };
}

const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });

export default function AdminAffiliatesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const hdr = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
      "Content-Type": "application/json",
    }),
    [],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/affiliates`, { headers: hdr() });
      const data = await res.json();
      setRows(data.affiliates || []);
    } catch {
      toast.error("Erro ao carregar afiliados");
    }
    setLoading(false);
  }, [hdr, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`${API}/api/admin/affiliates/${id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        toast.success(enabled ? "Afiliado ativado" : "Afiliado desativado");
        load();
      } else {
        toast.error("Falha ao atualizar");
      }
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      r.code.toLowerCase().includes(q) ||
      r.user?.name?.toLowerCase().includes(q) ||
      r.user?.email?.toLowerCase().includes(q)
    );
  });

  const summary = rows.reduce(
    (acc, r) => {
      acc.paidLeads += r.stats.paidReferrals;
      acc.available += r.stats.availableCommission;
      acc.pending += r.stats.pendingCommission;
      acc.paidOut += r.stats.totalPaidOut;
      return acc;
    },
    { paidLeads: 0, available: 0, pending: 0, paidOut: 0 },
  );

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Afiliados</h1>
        <p className={styles.pageDesc}>
          Gerencie todos os afiliados e acompanhe o volume gerado por cada um.
        </p>
      </div>

      {/* Summary */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Total de afiliados</span>
          <span className={styles.kpiValue}>{rows.length}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Vendas confirmadas</span>
          <span className={styles.kpiValue}>{summary.paidLeads}</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>A liberar (D+7)</span>
          <span className={styles.kpiValue}>{fmtMzn(summary.pending)} MT</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>Saldo disponível</span>
          <span className={styles.kpiValue} style={{ color: "var(--accent)" }}>
            {fmtMzn(summary.available)} MT
          </span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          className={styles.searchInput}
          placeholder="Buscar por código, nome ou e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.empty}>Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>Nenhum afiliado encontrado.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Afiliado</th>
                <th>Código</th>
                <th>Vendas</th>
                <th>Pendente</th>
                <th>Disponível</th>
                <th>Pago</th>
                <th>Método</th>
                <th>Status</th>
                <th>Desde</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <strong>{r.user?.name}</strong>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {r.user?.email}
                      </span>
                    </div>
                  </td>
                  <td>
                    <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                      {r.code}
                    </code>
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.stats.paidReferrals}
                    {r.stats.lostReferrals > 0 && (
                      <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
                        {" "}
                        ({r.stats.lostReferrals} reembolso/remarket)
                      </span>
                    )}
                  </td>
                  <td>{fmtMzn(r.stats.pendingCommission)}</td>
                  <td style={{ color: "var(--accent)" }}>{fmtMzn(r.stats.availableCommission)}</td>
                  <td>{fmtMzn(r.stats.totalPaidOut)}</td>
                  <td style={{ fontSize: 12 }}>
                    {r.payoutMethod
                      ? `${r.payoutMethod === "mpesa" ? "M-Pesa" : "eMola"} ${r.payoutTarget ?? ""}`
                      : "—"}
                  </td>
                  <td>
                    <Badge size="sm" variant={r.enabled ? "success" : "neutral"}>
                      {r.enabled ? "Ativo" : "Desativado"}
                    </Badge>
                  </td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(r.createdAt)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() => toggle(r.id, !r.enabled)}
                    >
                      {r.enabled ? "Desativar" : "Ativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
