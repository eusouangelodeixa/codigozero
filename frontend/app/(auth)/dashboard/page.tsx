"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { PageHeader, Card, Button, Skeleton } from "@/components/ui";
import { CofreIcon, ForjaIcon, QGIcon, RadarIcon, DisparadorIcon } from "@/components/Icons";
import styles from "./dashboard.module.css";

interface Metrics {
  totalLeads: number;
  totalCampaigns: number;
  messagesSent: number;
  completedLessons: number;
  totalLessons: number;
  progressPercentage: number;
  searchesRemaining: number;
  dailySearchLimit: number;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

const ChevronRight = (props: { size?: number }) => (
  <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Membro");

  useEffect(() => {
    try {
      const cached = localStorage.getItem("cz_user");
      if (cached) {
        const u = JSON.parse(cached);
        setUserName(u.name?.split(" ")[0] || "Membro");
      }
    } catch {}

    apiClient
      .getMetrics()
      .then((data) => setMetrics(data.metrics))
      .catch((e) => console.error("Failed to load metrics:", e))
      .finally(() => setLoading(false));
  }, []);

  const completed = metrics?.completedLessons ?? 0;
  const total = metrics?.totalLessons ?? 0;
  const progress = metrics?.progressPercentage ?? 0;
  const dailyLimit = metrics?.dailySearchLimit ?? 10;
  const searchesRemaining = metrics?.searchesRemaining ?? dailyLimit;
  const leads = metrics?.totalLeads ?? 0;
  const campaigns = metrics?.totalCampaigns ?? 0;
  const messagesSent = metrics?.messagesSent ?? 0;

  const quickLinks: { href: string; icon: React.ReactNode; title: string; desc: string }[] = [
    { href: "/cofre", icon: <CofreIcon size={20} />, title: "Cofre", desc: "Scripts prontos para vender" },
    { href: "/forja", icon: <ForjaIcon size={20} />, title: "Forja", desc: "Aulas e materiais de domínio" },
    { href: "/qg", icon: <QGIcon size={20} />, title: "QG", desc: "Comunidade e mentorias ao vivo" },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        label="Início"
        title={`${greeting()}, ${userName}`}
        description="Aqui está o resumo de onde você está hoje. Comece pela ação do dia."
      />

      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.heroAccentLine} aria-hidden />
        <div className={styles.heroBody}>
          <div className={styles.heroText}>
            <span className={styles.heroEyebrow}>Ação do dia</span>
            <h2 className={styles.heroTitle}>Encontre seus próximos clientes em segundos.</h2>
            <p className={styles.heroDesc}>
              Informe um nicho e uma cidade — o Radar varre o Google Maps, qualifica e devolve a lista pronta para abordagem.
            </p>
          </div>
          <div className={styles.heroActions}>
            <Button
              variant="primary"
              size="hero"
              onClick={() => router.push("/radar")}
              iconStart={<RadarIcon size={18} />}
              iconEnd={<ChevronRight size={16} />}
            >
              Iniciar prospecção
            </Button>
          </div>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className={styles.metricsGrid}>
        <Card>
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Leads extraídos</span>
              <span className={styles.metricIcon}><RadarIcon size={14} /></span>
            </div>
            <div className={styles.metricValue}>
              {loading ? <Skeleton variant="title" width={64} /> : leads.toLocaleString("pt-BR")}
            </div>
            <span className={styles.metricHint}>
              {loading ? " " : campaigns > 0 ? `em ${campaigns} ${campaigns === 1 ? "campanha" : "campanhas"}` : "desde o início"}
            </span>
          </div>
        </Card>

        <Card>
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Disparos enviados</span>
              <span className={styles.metricIcon}><DisparadorIcon size={14} /></span>
            </div>
            <div className={styles.metricValue}>
              {loading ? <Skeleton variant="title" width={64} /> : messagesSent.toLocaleString("pt-BR")}
            </div>
            <span className={styles.metricHint}>mensagens entregues</span>
          </div>
        </Card>

        <Card>
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Aulas concluídas</span>
              <span className={styles.metricIcon}><ForjaIcon size={14} /></span>
            </div>
            <div className={styles.metricValue}>
              {loading ? (
                <Skeleton variant="title" width={84} />
              ) : (
                <>
                  {completed}
                  <span className={styles.metricSuffix}>/ {total}</span>
                </>
              )}
            </div>
            <span className={styles.metricHint}>{progress}% completo</span>
          </div>
        </Card>

        <Card>
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Buscas restantes</span>
              <span className={styles.metricIcon}><RadarIcon size={14} /></span>
            </div>
            <div className={styles.metricValue}>
              {loading ? (
                <Skeleton variant="title" width={48} />
              ) : (
                <>
                  {searchesRemaining}
                  <span className={styles.metricSuffix}>/ {dailyLimit}</span>
                </>
              )}
            </div>
            <span className={styles.metricHint}>renova diariamente</span>
          </div>
        </Card>
      </div>

      {/* ── Progress ── */}
      <Card>
        <div className={styles.progressCard}>
          <div className={styles.progressHead}>
            <div className={styles.progressTitle}>
              <span className={styles.progressTitleMain}>Progresso na Forja</span>
              <span className={styles.progressTitleSub}>{completed} de {total} aulas concluídas</span>
            </div>
            <span className={styles.progressPercent}>{progress}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </Card>

      {/* ── Quick Links ── */}
      <span className={styles.sectionLabel}>Acesso rápido</span>
      <div className={styles.quickLinks}>
        {quickLinks.map((item) => (
          <Card
            key={item.href}
            as="button"
            interactive
            accentHover
            onClick={() => router.push(item.href)}
          >
            <div className={styles.quickLink}>
              <span className={styles.qlIcon}>{item.icon}</span>
              <span className={styles.qlText}>
                <span className={styles.qlTitle}>{item.title}</span>
                <span className={styles.qlDesc}>{item.desc}</span>
              </span>
              <span className={styles.qlChevron}><ChevronRight /></span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
