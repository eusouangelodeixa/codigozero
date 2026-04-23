"use client";
import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { CofreIcon, ForjaIcon, QGIcon } from "@/components/Icons";
import styles from "./dashboard.module.css";

interface Metrics {
  totalLeads: number;
  completedLessons: number;
  totalLessons: number;
  progressPercentage: number;
  searchesRemaining: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const cached = localStorage.getItem("cz_user");
    if (cached) {
      try { setUserName(JSON.parse(cached).name?.split(" ")[0] || ""); } catch {}
    }
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const data = await apiClient.getMetrics();
      setMetrics(data.metrics);
    } catch (error) {
      console.error("Failed to load metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  return (
    <div className={styles.page}>
      {/* Section Header */}
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Dashboard</span>
        <h1 className={styles.sectionTitle}>
          {greeting()}, {userName || "Membro"}
        </h1>
        <p className={styles.sectionDescription}>Aqui está o resumo do seu progresso.</p>
      </div>

      {/* Metrics Grid */}
      <div className={styles.metricsGrid}>
        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Leads Extraídos</span>
          <span className={styles.metricValue}>
            {loading ? "—" : metrics?.totalLeads || 0}
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Aulas Concluídas</span>
          <span className={styles.metricValue}>
            {loading ? "—" : `${metrics?.completedLessons || 0}/${metrics?.totalLessons || 0}`}
          </span>
        </div>

        <div className={styles.metricCard}>
          <span className={styles.metricLabel}>Buscas Restantes</span>
          <span className={styles.metricValue}>
            {loading ? "—" : metrics?.searchesRemaining ?? 10}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className={styles.progressSection}>
        <div className={styles.progressLabel}>
          <span>Progresso geral</span>
          <strong>{loading ? "—" : `${metrics?.progressPercentage || 0}%`}</strong>
        </div>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${metrics?.progressPercentage || 0}%` }}
          />
        </div>
      </div>

      {/* CTA */}
      <button
        className={styles.ctaButton}
        onClick={() => router.push("/radar")}
      >
        Iniciar Prospecção →
      </button>

      {/* Quick Links */}
      <div className={styles.quickLinks}>
        {[
          { href: "/cofre", icon: <CofreIcon size={20} />, title: "Scripts", desc: "Scripts prontos para vender" },
          { href: "/forja", icon: <ForjaIcon size={20} />, title: "Aulas", desc: "Domine o negócio de IA" },
          { href: "/qg", icon: <QGIcon size={20} />, title: "Comunidade", desc: "Discord e mentorias ao vivo" },
        ].map((item) => (
          <button
            key={item.href}
            onClick={() => router.push(item.href)}
            className={styles.quickLink}
          >
            <span className={styles.qlIcon}>{item.icon}</span>
            <span className={styles.qlText}>
              <strong>{item.title}</strong>
              <small>{item.desc}</small>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}
      </div>
    </div>
  );
}
