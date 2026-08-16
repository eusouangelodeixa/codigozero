"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { PageHeader, Card, Button, Skeleton } from "@/components/ui";
import { CofreIcon, ForjaIcon, QGIcon, RadarIcon, DisparadorIcon, ChatIcon } from "@/components/Icons";
import { Wrench } from "lucide-react";
import { Tour, type TourStep } from "@/components/tour/Tour";
import styles from "./dashboard.module.css";

// ── Tour guiado da plataforma (dispara após o onboarding ou via ?tour=1) ──
// Alvos invisíveis no dispositivo (ex.: sidebar no mobile) são pulados sozinhos.
const TOUR_STEPS: TourStep[] = [
  { target: "acao-do-dia", title: "Ação do dia", body: "A plataforma olha onde você está (assinatura, cursos, leads) e sugere o próximo melhor passo. Na dúvida, comece por aqui." },
  { target: "kpis", title: "Seu progresso", body: "Cursos iniciados, concluídos, aulas assistidas e o progresso geral — sempre atualizados." },
  { target: "meus-cursos", title: "Meus cursos", body: "Um clique em qualquer curso e você cai direto na área de membros, já logado, no ponto onde parou." },
  { target: "nav-radar", title: "Radar", body: "Sua máquina de leads: informe nicho + cidade e o Radar varre o Google Maps e devolve a lista qualificada, pronta pra abordar." },
  { target: "nav-disparador", title: "Disparador", body: "Envia sua campanha pro WhatsApp dos leads com intervalo seguro entre mensagens — sem risco de bloqueio." },
  { target: "nav-cofre", title: "Cofre", body: "Scripts prontos de venda e abordagem, organizados por situação. Copia, adapta e usa." },
  { target: "nav-forja", title: "Cursos", body: "A área de membros com todas as aulas, materiais e seu progresso — também disponível em members.czero.sbs." },
  { target: "nav-qg", title: "Comunidades", body: "Discord, grupo exclusivo no WhatsApp e as mentorias ao vivo semanais. É aqui que você não anda sozinho." },
  { target: "nav-chat", title: "Suporte", body: "Canal direto com a equipe — texto, foto ou áudio. Qualquer dúvida ou problema, chama por aqui." },
  { target: "operacao", title: "Sua operação", body: "Os números do seu trabalho: leads extraídos, disparos enviados e as buscas de hoje no Radar." },
];

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

interface CourseRow {
  slug: string;
  name: string;
  totalLessons: number;
  completedLessons: number;
  pct: number;
  started: boolean;
}

interface DashBanner {
  id: string;
  imageUrl: string;
  mobileImageUrl?: string;
  linkUrl?: string;
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

// ── Banners rotativos (config do admin — mesma mecânica da área de membros:
// quadro fixo, arte mobile opcional substitui a desktop no celular). ──
function BannerCarousel({ banners }: { banners: DashBanner[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (banners.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 6000);
    return () => clearInterval(t);
  }, [banners.length]);
  if (!banners.length) return null;
  return (
    <div className={styles.banners}>
      {banners.map((b, i) => {
        const img = (
          <span className={b.mobileImageUrl ? styles.hasMobileArt : undefined} style={{ position: "absolute", inset: 0, display: "block" }}>
            <img className={styles.bannerImgDesktop} src={b.imageUrl} alt="" />
            {b.mobileImageUrl && <img className={styles.bannerImgMobile} src={b.mobileImageUrl} alt="" />}
          </span>
        );
        return (
          <div key={b.id || i} className={`${styles.bannerSlide} ${i === idx % banners.length ? styles.bannerSlideActive : ""}`}>
            {b.linkUrl ? (
              <a href={b.linkUrl} target="_blank" rel="noopener noreferrer">{img}</a>
            ) : (
              img
            )}
          </div>
        );
      })}
      {banners.length > 1 && (
        <div className={styles.bannerDots}>
          {banners.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.bannerDot} ${i === idx % banners.length ? styles.bannerDotActive : ""}`}
              onClick={() => setIdx(i)}
              aria-label={`Banner ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [banners, setBanners] = useState<DashBanner[]>([]);
  const [sub, setSub] = useState<SubInfo | null>(null);
  const [verse, setVerse] = useState<Verse | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("Membro");
  const [tourOpen, setTourOpen] = useState(false);

  // Tour: dispara vindo do onboarding (cz_tour_pending) ou via /dashboard?tour=1
  // (jeito fácil de rever/testar a qualquer momento).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      if (p.get("tour") === "1" || localStorage.getItem("cz_tour_pending") === "1") {
        // Espera o primeiro paint pros alvos existirem.
        setTimeout(() => setTourOpen(true), 600);
      }
    } catch {}
  }, []);

  const closeTour = () => {
    setTourOpen(false);
    try {
      localStorage.removeItem("cz_tour_pending");
      localStorage.setItem("cz_tour_done", "1");
      window.history.replaceState(null, "", "/dashboard");
    } catch {}
  };

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
        setCourses(Array.isArray(data.courses) ? data.courses : []);
        setBanners(Array.isArray(data.banners) ? data.banners : []);
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

  // KPIs de plataforma multi-curso.
  const coursesTotal = courses.length;
  const coursesStarted = courses.filter((c) => c.started).length;
  const coursesDone = courses.filter((c) => c.totalLessons > 0 && c.pct === 100).length;
  const nextCourse =
    courses.find((c) => c.started && c.pct < 100) || courses.find((c) => c.pct < 100) || null;

  // Abre a área de membros já no curso certo (a ponte /forja faz o SSO e o
  // fragment `to` leva ao slug). Em ABA NOVA de propósito: o members é outro
  // domínio e o app deve ficar onde estava. window.open aqui é síncrono no
  // clique (gesto real), então não cai no bloqueador de popup.
  const openCourse = (c?: CourseRow | null) =>
    window.open(c ? `/forja?to=${encodeURIComponent(`/${c.slug}`)}` : "/forja", "_blank", "noopener");

  // ── Dynamic "Ação do dia" — the next best step for THIS member, based on
  // where they are (subscription, courses, leads, dispatches). ──
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
        desc: "Renove para não perder o acesso aos cursos, scripts e ao Radar.",
        button: "Renovar assinatura",
        href: "/assinatura",
        icon: <DisparadorIcon size={18} />,
      };
    }
    if (nextCourse && nextCourse.started) {
      return {
        eyebrow: "Ação do dia",
        title: `Continue de onde parou em ${nextCourse.name}.`,
        desc: `Você já concluiu ${nextCourse.pct}% desse curso. Avance mais uma aula hoje.`,
        button: "Continuar curso",
        href: `/forja?to=${encodeURIComponent(`/${nextCourse.slug}`)}`,
        icon: <ForjaIcon size={18} />,
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
    if (nextCourse) {
      return {
        eyebrow: "Ação do dia",
        title: `Comece o curso ${nextCourse.name}.`,
        desc: "Você ainda não iniciou esse curso. Assista à primeira aula hoje e destrave o próximo nível.",
        button: "Começar agora",
        href: `/forja?to=${encodeURIComponent(`/${nextCourse.slug}`)}`,
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
    { href: "/qg", icon: <QGIcon size={20} />, title: "Comunidades", desc: "Discord, WhatsApp e mentorias ao vivo" },
    { href: "/chat", icon: <ChatIcon size={20} />, title: "Suporte", desc: "Fale direto com a equipe" },
    { href: "/ferramentas", icon: <Wrench size={20} strokeWidth={1.6} />, title: "Ferramentas", desc: "Komunika e próximas ferramentas" },
  ];

  return (
    <div className={styles.page}>
      {tourOpen && <Tour steps={TOUR_STEPS} onClose={closeTour} />}
      <PageHeader
        label="Início"
        title={`${greeting()}, ${userName}`}
        description="Sua central de cursos e ferramentas. Continue de onde parou."
      />

      {/* ── Banners (config do admin) ── */}
      <BannerCarousel banners={banners} />

      {/* ── Hero (dynamic action of the day) ── */}
      <div className={styles.hero} data-tour="acao-do-dia">
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
              onClick={() =>
                action.href.startsWith("/forja")
                  ? window.open(action.href, "_blank", "noopener")
                  : router.push(action.href)
              }
              iconStart={action.icon}
              iconEnd={<ChevronRight size={16} />}
            >
              {action.button}
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPIs (plataforma multi-curso) ── */}
      <div className={styles.metricsGrid} data-tour="kpis">
        <Card>
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Cursos iniciados</span>
              <span className={styles.metricIcon}><ForjaIcon size={14} /></span>
            </div>
            <div className={styles.metricValue}>
              {loading ? (
                <Skeleton variant="title" width={64} />
              ) : (
                <>
                  {coursesStarted}
                  <span className={styles.metricSuffix}>/ {coursesTotal}</span>
                </>
              )}
            </div>
            <span className={styles.metricHint}>cursos disponíveis pra você</span>
          </div>
        </Card>

        <Card>
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Cursos concluídos</span>
              <span className={styles.metricIcon}><ForjaIcon size={14} /></span>
            </div>
            <div className={styles.metricValue}>
              {loading ? <Skeleton variant="title" width={48} /> : coursesDone}
            </div>
            <span className={styles.metricHint}>{coursesDone > 0 ? "100% das aulas assistidas" : "chegue aos 100% de um curso"}</span>
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
            <span className={styles.metricHint}>em todos os cursos</span>
          </div>
        </Card>

        <Card>
          <div className={styles.metric}>
            <div className={styles.metricHeader}>
              <span className={styles.metricLabel}>Progresso geral</span>
              <span className={styles.metricIcon}><ForjaIcon size={14} /></span>
            </div>
            <div className={styles.metricValue}>
              {loading ? <Skeleton variant="title" width={64} /> : <>{progress}<span className={styles.metricSuffix}>%</span></>}
            </div>
            <div className={styles.progressTrack} style={{ marginTop: 2 }}>
              <div className={styles.progressFill} style={{ width: `${progress}%` }} />
            </div>
          </div>
        </Card>
      </div>

      {/* ── Meus cursos ── */}
      {courses.length > 0 && (
        <>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>Meus cursos</span>
            <button type="button" className={styles.sectionAction} onClick={() => openCourse(null)}>
              Abrir área de membros <ChevronRight size={13} />
            </button>
          </div>
          <div className={styles.courseGrid} data-tour="meus-cursos">
            {courses.map((c) => (
              <Card key={c.slug} as="button" interactive accentHover onClick={() => openCourse(c)}>
                <div className={styles.courseRow}>
                  <div className={styles.courseInfo}>
                    <span className={styles.courseName}>{c.name}</span>
                    <span className={styles.courseMeta}>
                      {c.completedLessons} de {c.totalLessons} aulas · {c.pct}%
                    </span>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                  <span className={styles.courseCta}>
                    {c.pct === 100 ? "Rever" : c.started ? "Continuar" : "Começar"}
                    <ChevronRight size={14} />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── Operação (Radar / Disparador) ── */}
      <span className={styles.sectionLabel}>Sua operação</span>
      <div className={styles.opsGrid} data-tour="operacao">
        <Card>
          <div className={styles.opMetric}>
            <span className={styles.opIcon}><RadarIcon size={16} /></span>
            <div className={styles.opText}>
              <span className={styles.opValue}>
                {loading ? <Skeleton variant="title" width={48} /> : leads.toLocaleString("pt-BR")}
              </span>
              <span className={styles.opLabel}>
                Leads extraídos{campaigns > 0 ? ` · ${campaigns} ${campaigns === 1 ? "campanha" : "campanhas"}` : ""}
              </span>
            </div>
          </div>
        </Card>
        <Card>
          <div className={styles.opMetric}>
            <span className={styles.opIcon}><DisparadorIcon size={16} /></span>
            <div className={styles.opText}>
              <span className={styles.opValue}>
                {loading ? <Skeleton variant="title" width={48} /> : messagesSent.toLocaleString("pt-BR")}
              </span>
              <span className={styles.opLabel}>Disparos enviados</span>
            </div>
          </div>
        </Card>
        <Card>
          <div className={styles.opMetric}>
            <span className={styles.opIcon}><RadarIcon size={16} /></span>
            <div className={styles.opText}>
              <span className={styles.opValue}>
                {loading ? <Skeleton variant="title" width={48} /> : `${searchesRemaining}/${dailyLimit}`}
              </span>
              <span className={styles.opLabel}>Buscas restantes hoje</span>
            </div>
          </div>
        </Card>
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
