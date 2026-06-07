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

interface SubInfo {
  subscriptionStatus?: string;
  subscriptionEnd?: string | null;
}

interface Verse {
  reference: string;
  text: string;
  theme: string;
  isSabbath: boolean;
  translation: string;
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
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [verse, setVerse] = useState<Verse | null>(null);
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
      .then((data) => {
        setMetrics(data.metrics);
        setSub(data.user || null);
      })
      .catch((e) => console.error("Failed to load metrics:", e))
      .finally(() => setLoading(false));

    apiClient
      .getVerseOfDay()
      .then((data) => setVerse(data.verse))
      .catch(() => {});
  }, []);

  const completed = metrics?.completedLessons ?? 0;
  const total = metrics?.totalLessons ?? 0;
  const progress = metrics?.progressPercentage ?? 0;
  const dailyLimit = metrics?.dailySearchLimit ?? 10;
  const searchesRemaining = metrics?.searchesRemaining ?? dailyLimit;
  const leads = metrics?.totalLeads ?? 0;
  const campaigns = metrics?.totalCampaigns ?? 0;
  const messagesSent = metrics?.messagesSent ?? 0;

  // ── Dynamic "Ação do dia" — the next best step for THIS member, based on
  // where they are (subscription, leads, dispatches, lessons). ──
  const daysToExpiry = sub?.subscriptionEnd
    ? Math.ceil((new Date(sub.subscriptionEnd).getTime() - Date.now()) / 86_400_000)
    : null;

  type DayAction = { eyebrow: string; title: string; desc: string; button: string; href: string; icon: React.ReactNode };
  const action: DayAction = (() => {
    if (sub && (sub.subscriptionStatus !== "active" || (daysToExpiry !== null && daysToExpiry <= 5))) {
      return {
        eyebrow: "Atenção",
        title:
          daysToExpiry !== null && daysToExpiry >= 0
            ? `Sua assinatura expira em ${daysToExpiry} dia${daysToExpiry === 1 ? "" : "s"}.`
            : "Reative seu acesso ao Código Zero.",
        desc: "Renove para não perder o acesso às aulas, scripts e ao Radar.",
        button: "Renovar assinatura",
        href: "/assinatura",
        icon: <DisparadorIcon size={18} />,
      };
    }
    if (leads === 0) {
      return {
        eyebrow: "Ação do dia",
        title: "Encontre seus próximos clientes em segundos.",
        desc: "Informe um nicho e uma cidade — o Radar varre o Google Maps, qualifica e devolve a lista pronta para abordagem.",
        button: "Iniciar prospecção",
        href: "/radar",
        icon: <RadarIcon size={18} />,
      };
    }
    if (messagesSent === 0) {
      return {
        eyebrow: "Ação do dia",
        title: `Você tem ${leads.toLocaleString("pt-BR")} lead${leads === 1 ? "" : "s"} prontos. Hora de abordar.`,
        desc: "Use o Disparador para enviar sua primeira campanha por WhatsApp — com intervalo seguro entre os envios.",
        button: "Abrir o Disparador",
        href: "/disparador",
        icon: <DisparadorIcon size={18} />,
      };
    }
    if (total > 0 && progress < 100) {
      return {
        eyebrow: "Ação do dia",
        title: "Continue de onde parou na Forja.",
        desc: `Você já concluiu ${progress}% das aulas. Avance mais uma hoje para dominar o método.`,
        button: "Continuar aulas",
        href: "/forja",
        icon: <ForjaIcon size={18} />,
      };
    }
    return {
      eyebrow: "Ação do dia",
      title: "Mantenha o ritmo: encontre mais clientes.",
      desc: "Faça uma nova prospecção no Radar e amplie sua carteira de leads qualificados.",
      button: "Nova prospecção",
      href: "/radar",
      icon: <RadarIcon size={18} />,
    };
  })();

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

      {/* ── Hero (dynamic action of the day) ── */}
      <div className={styles.hero}>
        <div className={styles.heroAccentLine} aria-hidden />
        <div className={styles.heroBody}>
          <div className={styles.heroText}>
            <span className={styles.heroEyebrow}>{action.eyebrow}</span>
            <h2 className={styles.heroTitle}>{action.title}</h2>
            <p className={styles.heroDesc}>{action.desc}</p>
          </div>
          <div className={styles.heroActions}>
            <Button
              variant="primary"
              size="hero"
              onClick={() => router.push(action.href)}
              iconStart={action.icon}
              iconEnd={<ChevronRight size={16} />}
            >
              {action.button}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Versículo do dia ── */}
      {verse && (
        <div className={styles.verse}>
          <span className={styles.verseEyebrow}>
            {verse.isSabbath ? "Versículo do dia · Dia de guardar o sábado" : "Versículo do dia"}
          </span>
          <p className={styles.verseText}>“{verse.text}”</p>
          <span className={styles.verseRef}>{verse.reference} · {verse.translation}</span>
        </div>
      )}

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
