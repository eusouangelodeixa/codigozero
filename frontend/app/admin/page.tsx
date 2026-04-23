"use client";
import { useState, useEffect } from "react";
import styles from "./admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/admin/stats`, { headers: hdr() })
      .then(r => r.json()).then(setStats).catch(console.error);
  }, []);

  if (!stats) return <div className={styles.loadingScreen}><p>Carregando...</p></div>;

  const kpis = [
    { label: "Total Leads", value: stats.leads, teal: false },
    { label: "Pagos / Ativos", value: stats.paidUsers, teal: true },
    { label: "MRR", value: `${stats.mrr.toLocaleString()} MT`, teal: true },
    { label: "Receita Total", value: `${stats.totalRevenue.toLocaleString()} MT`, teal: false },
    { label: "Vagas Restantes", value: stats.vagasRestantes, teal: false, sub: `de ${stats.vagasRestantes + stats.paidUsers}` },
    { label: "Usuários Totais", value: stats.totalUsers, teal: false },
    { label: "Módulos / Aulas", value: `${stats.totalModules} / ${stats.totalLessons}`, teal: false },
    { label: "Scripts", value: stats.totalScripts, teal: false },
  ];

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageDesc}>Visão geral do ecossistema Código Zero</p>
      </div>

      <div className={styles.kpiGrid}>
        {kpis.map((kpi, i) => (
          <div key={i} className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{kpi.label}</p>
            <p className={`${styles.kpiValue} ${kpi.teal ? styles.kpiValueTeal : ""}`}>{kpi.value}</p>
            {kpi.sub && <p className={styles.kpiSub}>{kpi.sub}</p>}
          </div>
        ))}
      </div>
    </>
  );
}
