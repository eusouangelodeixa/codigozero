"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminLeads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (search) params.set("search", search);
    fetch(`${API}/api/admin/leads?${params}`, { headers: hdr() })
      .then(r => r.json())
      .then(data => { setLeads(data.leads || []); setTotal(data.total || 0); })
      .catch(console.error);
  }, [filter, search]);

  useEffect(() => { load(); }, [load]);

  const statusBadge = (lead: any) => {
    if (lead.lojouOrderId && lead.subscriptionStatus === "active") return <span className={`${styles.badge} ${styles.badgeGreen}`}>Pago</span>;
    if (lead.subscriptionStatus === "lead") return <span className={`${styles.badge} ${styles.badgeYellow}`}>Lead</span>;
    return <span className={`${styles.badge} ${styles.badgeGray}`}>{lead.subscriptionStatus}</span>;
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Leads da Landing Page</h1>
        <p className={styles.pageDesc}>{total} registos encontrados</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableToolbar}>
          <input
            className={styles.tableSearch}
            placeholder="Buscar por nome, email ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {["all", "paid", "unpaid"].map(f => (
            <button key={f} className={`${styles.filterBtn} ${filter === f ? styles.filterBtnActive : ""}`} onClick={() => setFilter(f)}>
              {f === "all" ? "Todos" : f === "paid" ? "Pagos" : "Não Pagos"}
            </button>
          ))}
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={5} className={styles.empty}>Nenhum lead encontrado</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id}>
                <td>{lead.name}</td>
                <td>{lead.email}</td>
                <td>{lead.phone}</td>
                <td>{statusBadge(lead)}</td>
                <td>{new Date(lead.createdAt).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
