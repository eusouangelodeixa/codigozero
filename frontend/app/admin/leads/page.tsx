"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "../admin.module.css";
import DateRangeFilter, { DateRange } from "@/components/admin/DateRangeFilter";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

const STATUS_LABEL: Record<string, string> = {
  active: "Assinante",
  grace_period: "Carência",
  overdue: "Atrasado",
  canceled: "Cancelado",
  lead: "Lead",
};

function statusClass(status: string) {
  if (status === "active") return styles.badgeGreen;
  if (status === "lead") return styles.badgeYellow;
  if (status === "overdue" || status === "canceled") return styles.badgeRed;
  if (status === "grace_period") return styles.badgeYellow;
  return styles.badgeGray;
}

export default function AdminLeads() {
  const [leads, setLeads] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<DateRange>({ period: "all" });
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (search) params.set("search", search);
    if (range.period !== "all") {
      params.set("period", range.period);
      if (range.period === "custom") {
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
      }
    }
    fetch(`${API}/api/admin/leads?${params}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => { setLeads(data.leads || []); setTotal(data.total || 0); })
      .catch(console.error);
  }, [filter, search, range]);

  useEffect(() => { load(); }, [load]);

  const badge = (lead: any) => (
    <span className={`${styles.badge} ${statusClass(lead.subscriptionStatus)}`}>
      {STATUS_LABEL[lead.subscriptionStatus] || lead.subscriptionStatus}
    </span>
  );

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

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
            onChange={(e) => setSearch(e.target.value)}
          />
          {[
            { id: "all", label: "Todos" },
            { id: "subscriber", label: "Assinantes" },
            { id: "unpaid", label: "Leads" },
          ].map((f) => (
            <button
              key={f.id}
              className={`${styles.filterBtn} ${filter === f.id ? styles.filterBtnActive : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles.tableToolbar}>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Cadastro</th>
              <th>Expira</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={6} className={styles.empty}>Nenhum lead encontrado</td></tr>
            ) : leads.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.name}</td>
                <td>{lead.email}</td>
                <td>{lead.phone}</td>
                <td>{badge(lead)}</td>
                <td>{fmtDate(lead.createdAt)}</td>
                <td>{fmtDate(lead.subscriptionEnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.mobileCards}>
          {leads.length === 0 ? (
            <div className={styles.empty}>Nenhum lead encontrado</div>
          ) : leads.map((lead) => (
            <div key={lead.id} className={styles.mCard}>
              <div className={styles.mCardHead}>
                <span className={styles.mCardName}>{lead.name}</span>
                {badge(lead)}
              </div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Email</span><span className={styles.mCardValue}>{lead.email}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Telefone</span><span className={styles.mCardValue}>{lead.phone}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Cadastro</span><span className={styles.mCardValue}>{fmtDate(lead.createdAt)}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Expira</span><span className={styles.mCardValue}>{fmtDate(lead.subscriptionEnd)}</span></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
