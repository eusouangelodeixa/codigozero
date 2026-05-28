"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../coproducer.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  subscriptionStatus: string;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  closeFriends: boolean;
  createdAt: string;
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:      { label: "Ativo",        color: "#22c55e" },
  grace_period:{ label: "Em atraso",    color: "#f59e0b" },
  overdue:     { label: "Vencido",      color: "#ef4444" },
  canceled:    { label: "Cancelado",    color: "#888" },
};

export default function CoproducerUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [upcoming, setUpcoming] = useState<{ id: string; name: string; email: string; subscriptionEnd: string; daysUntilExpiry: number; closeFriends: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (search) params.set("search", search);
    const [r1, r2] = await Promise.all([
      fetch(`${API}/api/coproducer/users?${params}`, { headers: hdr() }),
      fetch(`${API}/api/coproducer/upcoming-renewals?days=30`, { headers: hdr() }),
    ]);
    if (r1.ok) setUsers((await r1.json()).users || []);
    if (r2.ok) setUpcoming((await r2.json()).users || []);
    setLoading(false);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Painel do coprodutor</span>
        <h1 className={styles.pageTitle}>Assinantes</h1>
        <p className={styles.pageDesc}>
          Pessoas que assinaram pelo seu link de coprodução, ativos ou cancelados.
        </p>
      </div>

      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          placeholder="Buscar por nome, email ou telefone…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {upcoming.length > 0 && (
        <div className={styles.tableCard} style={{ marginBottom: 16 }}>
          <div className={styles.tableHead}>
            <span className={styles.tableTitle}>Próximas renovações (30 dias)</span>
            <span className={styles.tableHint}>{upcoming.length} usuários</span>
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Expira em</th>
                <th style={{ textAlign: "right" }}>Dias</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>
                      {u.name || "—"}
                      {u.closeFriends && (
                        <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 999, fontSize: 9, fontWeight: 700, background: "linear-gradient(135deg, #f5d76e, #d4af37)", color: "#1a1100" }}>★ CF</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{u.email}</div>
                  </td>
                  <td style={{ color: "var(--text-tertiary)" }}>
                    {new Date(u.subscriptionEnd).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: u.daysUntilExpiry <= 3 ? "#ef4444" : "var(--text-primary)" }}>
                    {u.daysUntilExpiry}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.tableCard}>
        <div className={styles.tableHead}>
          <span className={styles.tableTitle}>Todos os assinantes</span>
          <span className={styles.tableHint}>{users.length}</span>
        </div>
        {users.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Status</th>
                <th>Início</th>
                <th>Fim</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const st = STATUS_LABEL[u.subscriptionStatus] || { label: u.subscriptionStatus, color: "#888" };
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {u.name}
                        {u.closeFriends && (
                          <span style={{ marginLeft: 6, padding: "1px 6px", borderRadius: 999, fontSize: 9, fontWeight: 700, background: "linear-gradient(135deg, #f5d76e, #d4af37)", color: "#1a1100" }}>★ CF</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{u.email} · {u.phone}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 11, fontWeight: 600, color: st.color }}>● {st.label}</span>
                    </td>
                    <td style={{ color: "var(--text-tertiary)" }}>
                      {u.subscriptionStart ? new Date(u.subscriptionStart).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td style={{ color: "var(--text-tertiary)" }}>
                      {u.subscriptionEnd ? new Date(u.subscriptionEnd).toLocaleDateString("pt-MZ", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className={styles.tableEmpty}>{loading ? "Carregando…" : "Nenhum assinante ainda."}</div>
        )}
      </div>
    </div>
  );
}
