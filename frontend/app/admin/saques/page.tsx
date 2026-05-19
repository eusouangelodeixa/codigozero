"use client";
import { useCallback, useEffect, useState } from "react";
import { Badge, useToast } from "@/components/ui";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Withdrawal {
  id: string;
  amountRequested: number;
  feeAmount: number;
  amountNet: number;
  payoutMethod: string;
  payoutTarget: string;
  status: string;
  notes: string | null;
  processedAt: string | null;
  processedBy: string | null;
  createdAt: string;
  affiliate: {
    code: string;
    user: { id: string; name: string; email: string; phone: string };
  };
}

const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminWithdrawalsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const hdr = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
      "Content-Type": "application/json",
    }),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`${API}/api/admin/affiliate-withdrawals${params}`, {
        headers: hdr(),
      });
      const data = await res.json();
      setRows(data.withdrawals || []);
    } catch {
      toast.error("Erro ao carregar saques");
    }
    setLoading(false);
  }, [filter, hdr, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: "approve" | "reject") => {
    const verb = action === "approve" ? "aprovar" : "rejeitar";
    const note = prompt(
      action === "approve"
        ? "Notas (opcional, ex.: nº de transação M-Pesa):"
        : "Motivo da rejeição (opcional):",
    );
    if (note === null) return;
    setBusyId(id);
    try {
      const res = await fetch(`${API}/api/admin/affiliate-withdrawals/${id}/${action}`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ notes: note || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(action === "approve" ? "Saque aprovado e pago" : "Saque rejeitado");
        load();
      } else {
        toast.error(`Falha ao ${verb}`, data.error);
      }
    } catch {
      toast.error(`Erro de conexão`);
    }
    setBusyId(null);
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Saques de afiliados</h1>
        <p className={styles.pageDesc}>
          Aprove saques após pagar via M-Pesa/eMola, ou rejeite para devolver o saldo ao afiliado.
        </p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          {[
            { key: "pending", label: "Pendentes" },
            { key: "paid", label: "Pagos" },
            { key: "rejected", label: "Rejeitados" },
            { key: "all", label: "Todos" },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.filterBtn} ${filter === f.key ? styles.filterBtnActive : ""}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.empty}>Carregando…</div>
        ) : rows.length === 0 ? (
          <div className={styles.empty}>Nenhum saque {filter === "all" ? "" : filter}.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Solicitado em</th>
                <th>Afiliado</th>
                <th>Bruto</th>
                <th>Taxa</th>
                <th>Líquido</th>
                <th>Método</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDateTime(w.createdAt)}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <strong>{w.affiliate.user?.name}</strong>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
                          {w.affiliate.code}
                        </code>
                        {" · "}
                        {w.affiliate.user?.email}
                      </span>
                    </div>
                  </td>
                  <td>{fmtMzn(w.amountRequested)}</td>
                  <td style={{ color: "var(--text-tertiary)" }}>{fmtMzn(w.feeAmount)}</td>
                  <td style={{ color: "var(--accent)", fontWeight: 600 }}>{fmtMzn(w.amountNet)}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span>{w.payoutMethod === "mpesa" ? "M-Pesa" : "eMola"}</span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                        {w.payoutTarget}
                      </span>
                    </div>
                  </td>
                  <td>
                    <Badge
                      size="sm"
                      variant={
                        w.status === "paid"
                          ? "success"
                          : w.status === "rejected"
                          ? "error"
                          : "warning"
                      }
                    >
                      {w.status === "paid" ? "Pago" : w.status === "rejected" ? "Rejeitado" : "Pendente"}
                    </Badge>
                    {w.notes && (
                      <div style={{ fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 4, maxWidth: 220 }}>
                        {w.notes}
                      </div>
                    )}
                  </td>
                  <td>
                    {w.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          className={styles.primaryBtn}
                          onClick={() => act(w.id, "approve")}
                          disabled={busyId === w.id}
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          className={styles.dangerBtn}
                          onClick={() => act(w.id, "reject")}
                          disabled={busyId === w.id}
                        >
                          Rejeitar
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                        {w.processedAt ? fmtDateTime(w.processedAt) : "—"}
                      </span>
                    )}
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
