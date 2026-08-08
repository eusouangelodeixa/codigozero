"use client";
// Instalar o app (PWA) — Código Zero
//
// Quem chega aqui quase sempre veio do WhatsApp (cron de "ainda não instalou"),
// está no celular e com pressa. Por isso a página:
//   1. detecta iOS/Android sozinha e já abre os passos certos;
//   2. reconhece quando o app JÁ está rodando em standalone;
//   3. no Android, oferece a instalação nativa (beforeinstallprompt) num toque;
//   4. explica o que a pessoa ganha ao ligar as notificações — e, quando o
//      navegador bloqueou, avisa que o botão não resolve (é nas configurações).
//
// ⚠️ A lógica de push (subscribeToPush + Notification.permission +
// pushManager.getSubscription) é a mesma de sempre — não mexer sem motivo.
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { subscribeToPush } from "@/lib/pushNotifications";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import styles from "./instalar.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type Platform = "ios" | "android";
type PushStatus = "idle" | "loading" | "granted" | "denied" | "unsupported" | "error";

/* ═══════════════ ÍCONES ═══════════════ */

interface IconProps {
  size?: number;
}

const AppleIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const AndroidIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.14-.52.38.38 0 0 0-.52.14l-1.86 3.22a11.43 11.43 0 0 0-8.86 0L6.2 5.92a.38.38 0 0 0-.52-.14.38.38 0 0 0-.14.52L7.4 9.48A10.78 10.78 0 0 0 2 18h20a10.78 10.78 0 0 0-4.4-8.52M7.9 14.75a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2m8.2 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2" />
  </svg>
);

const BellIcon = ({ size = 20 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

const ShareIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 16V3" />
    <path d="M8 7l4-4 4 4" />
    <path d="M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
  </svg>
);

const AddToHomeIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

const MenuDotsIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </svg>
);

const DownloadIcon = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12" />
    <path d="M8 11l4 4 4-4" />
    <path d="M4 19h16" />
  </svg>
);

const CheckIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const CheckCircleIcon = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.5 2.5 4.5-5" />
  </svg>
);

const AlertIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3.5l9 15.5H3l9-15.5z" />
    <path d="M12 10v4M12 17h.01" />
  </svg>
);

const InfoIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

/* ═══════════════ DETECÇÃO ═══════════════ */

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "android";
  const ua = navigator.userAgent || "";
  // iPadOS 13+ se disfarça de macOS — o toque entrega.
  const isIPadOS = /Mac/i.test(ua) && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(ua) || isIPadOS ? "ios" : "android";
}

function detectPhone(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || navigator.maxTouchPoints > 1;
}

// "Standalone" = aberto pelo ícone da tela inicial, sem a barra do navegador.
function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const modes = ["standalone", "fullscreen", "minimal-ui"];
  if (typeof window.matchMedia === "function") {
    if (modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) return true;
  }
  return (navigator as NavigatorWithStandalone).standalone === true;
}

// Chrome guarda o convite de instalação nativo neste evento.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/* ═══════════════ CONTEÚDO ═══════════════ */

const Ui = ({ icon, children }: { icon?: ReactNode; children: ReactNode }) => (
  <span className={styles.uiName}>
    {icon}
    {children}
  </span>
);

interface Step {
  title: string;
  text: ReactNode;
}

const STEPS: Record<Platform, Step[]> = {
  ios: [
    {
      title: "Abra no Safari",
      text: (
        <>
          No iPhone só dá pra instalar pelo <Ui>Safari</Ui>. Se você caiu aqui pelo WhatsApp ou
          Instagram, toque nos três pontinhos e escolha <Ui>Abrir no Safari</Ui>.
        </>
      ),
    },
    {
      title: "Toque em Compartilhar",
      text: (
        <>
          É o <Ui icon={<ShareIcon />}>Compartilhar</Ui> — o quadradinho com a seta pra cima, na
          barra de baixo.
        </>
      ),
    },
    {
      title: "Adicionar à Tela de Início",
      text: (
        <>
          Role a lista de opções até achar{" "}
          <Ui icon={<AddToHomeIcon />}>Adicionar à Tela de Início</Ui>. Costuma estar bem no meio.
        </>
      ),
    },
    {
      title: "Confirme em Adicionar",
      text: (
        <>
          O nome já vem preenchido como “Código Zero”. Toque em <Ui>Adicionar</Ui>, no canto
          superior direito.
        </>
      ),
    },
    {
      title: "Pronto — abra pelo ícone",
      text: "O Código Zero fica na tela inicial como qualquer outro app. É por ali que você entra daqui pra frente.",
    },
  ],
  android: [
    {
      title: "Abra no Chrome",
      text: (
        <>
          Use o <Ui>Google Chrome</Ui>. Se abriu dentro do WhatsApp ou do Instagram, toque nos três
          pontinhos e escolha <Ui>Abrir no Chrome</Ui>.
        </>
      ),
    },
    {
      title: "Toque no menu de 3 pontinhos",
      text: (
        <>
          Fica no <Ui icon={<MenuDotsIcon />}>canto superior direito</Ui>, ao lado da barra de
          endereço.
        </>
      ),
    },
    {
      title: "Escolha Instalar app",
      text: (
        <>
          Toque em <Ui icon={<DownloadIcon size={14} />}>Instalar app</Ui>. Em alguns celulares
          aparece como <Ui>Adicionar à tela inicial</Ui>.
        </>
      ),
    },
    {
      title: "Confirme em Instalar",
      text: (
        <>
          Uma janelinha pede confirmação — toque em <Ui>Instalar</Ui>.
        </>
      ),
    },
    {
      title: "Pronto — abra pelo ícone",
      text: "O Código Zero fica na tela inicial e abre igual a um app nativo, em tela cheia.",
    },
  ],
};

const PUSH_BENEFITS = [
  "Aula nova no ar — você fica sabendo na hora",
  "Lembrete da mentoria ao vivo antes de começar",
  "Resposta do suporte chegando direto no celular",
];

const UNBLOCK_HINT: Record<Platform, ReactNode> = {
  ios: (
    <>
      Abra os <strong>Ajustes</strong> do iPhone → <strong>Notificações</strong> →{" "}
      <strong>Código Zero</strong> e ligue <strong>Permitir Notificações</strong>.
    </>
  ),
  android: (
    <>
      No Chrome: <strong>⋮</strong> → <strong>Configurações</strong> →{" "}
      <strong>Configurações do site</strong> → <strong>Notificações</strong> → escolha o Código Zero
      e marque <strong>Permitir</strong>.
    </>
  ),
};

/* ═══════════════ PÁGINA ═══════════════ */

export default function InstalarPage() {
  const router = useRouter();

  const [platform, setPlatform] = useState<Platform>(detectPlatform);
  const [autoDetected, setAutoDetected] = useState(true);
  const [isPhone, setIsPhone] = useState(detectPhone);
  const [runningInApp, setRunningInApp] = useState(detectStandalone);
  const [justInstalled, setJustInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  const [pushStatus, setPushStatus] = useState<PushStatus>("idle");
  const [pushError, setPushError] = useState("");

  const installed = runningInApp || justInstalled;

  /* ── Ambiente: plataforma, standalone e convite nativo de instalação ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    setPlatform(detectPlatform());
    setIsPhone(detectPhone());
    setRunningInApp(detectStandalone());

    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) setRunningInApp(true);
    };
    mq?.addEventListener?.("change", onDisplayModeChange);

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstallPrompt(null);
      setJustInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      mq?.removeEventListener?.("change", onDisplayModeChange);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  /* ── Push: estado atual da permissão (lógica original, intocada) ── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPushStatus("unsupported");
      return;
    }
    if (Notification.permission === "granted") {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setPushStatus(sub ? "granted" : "idle"))
        .catch(() => {});
    } else if (Notification.permission === "denied") {
      setPushStatus("denied");
    }
  }, []);

  const handleActivatePush = async () => {
    setPushStatus("loading");
    setPushError("");
    try {
      const ok = await subscribeToPush();
      if (ok) {
        setPushStatus("granted");
        return;
      }
      setPushStatus("error");
      if (!("PushManager" in window)) {
        setPushError("PushManager indisponível. Adicione o app à tela inicial primeiro.");
      } else if (Notification.permission === "denied") {
        setPushError("Permissão negada. Vá às configurações do navegador.");
      } else {
        setPushError("Falha ao registrar. Verifique a conexão.");
      }
    } catch (err) {
      setPushStatus("error");
      setPushError(err instanceof Error ? err.message : "Erro desconhecido");
    }
  };

  const handleNativeInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setJustInstalled(true);
    } catch {
      /* usuário fechou o diálogo — segue com o passo a passo manual */
    }
    setInstallPrompt(null);
  };

  const pickPlatform = (p: Platform) => {
    setPlatform(p);
    setAutoDetected(false);
  };

  const steps = STEPS[platform];
  const stepsVisible = !installed || showSteps;

  // No iPhone, push só existe dentro do app instalado — o "unsupported" ali
  // não é limitação do aparelho, é falta do passo 1.
  const needsInstallForPush = pushStatus === "unsupported" && platform === "ios" && !runningInApp;

  const pushHint = (() => {
    switch (pushStatus) {
      case "granted":
        return "Tudo ligado. Os avisos chegam neste aparelho.";
      case "denied":
        return "Este navegador está com as notificações bloqueadas.";
      case "unsupported":
        return needsInstallForPush
          ? "No iPhone, os avisos só funcionam com o app na tela inicial."
          : "Este navegador não suporta notificações push.";
      case "error":
        return pushError || "Não deu certo. Tenta de novo?";
      case "loading":
        return "Pedindo permissão ao navegador…";
      default:
        return "Um toque e você não perde mais nada.";
    }
  })();

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Instalar"
        title={installed ? "Seu app já está instalado" : "Coloque o app na tela inicial"}
        description={
          installed
            ? "Você está usando o Código Zero como app. Agora falta só ligar as notificações pra não perder aula nova nem mentoria."
            : "São 4 toques. Depois é só abrir pelo ícone: entra direto, em tela cheia, e recebe os avisos importantes."
        }
      />

      {/* ══════════ PASSO 01 — Instalar ══════════ */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>Passo 01</span>
          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Instalar o app</h2>
            {installed && (
              <Badge variant="success" size="md" dot>
                Feito
              </Badge>
            )}
          </div>
        </div>

        {installed ? (
          <Card padding="lg">
            <div className={styles.doneCard}>
              <span className={styles.doneIcon}>
                <CheckCircleIcon />
              </span>
              <div className={styles.doneBody}>
                <span className={styles.doneTitle}>
                  {runningInApp ? "Você já está dentro do app" : "Instalado com sucesso"}
                </span>
                <span className={styles.doneText}>
                  {runningInApp
                    ? "Nada a fazer aqui — este é o Código Zero rodando na tela inicial do seu aparelho."
                    : "Feche esta aba e abra o Código Zero pelo ícone novo na sua tela inicial."}
                </span>
              </div>
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => setShowSteps((v) => !v)}
              >
                {showSteps ? "Esconder os passos" : "Instalar em outro aparelho"}
              </button>
            </div>
          </Card>
        ) : (
          <>
            {installPrompt && (
              <Card padding="lg">
                <div className={styles.quickInstall}>
                  <div className={styles.quickBody}>
                    <span className={styles.quickTitle}>Instalação em 1 toque</span>
                    <span className={styles.quickText}>
                      Seu navegador consegue instalar sozinho — sem passo a passo.
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    iconStart={<DownloadIcon />}
                    onClick={handleNativeInstall}
                  >
                    Instalar agora
                  </Button>
                </div>
              </Card>
            )}

            <div className={styles.switchRow}>
              <div className={styles.switch} role="group" aria-label="Escolha o seu aparelho">
                <button
                  type="button"
                  className={cx(styles.switchBtn, platform === "ios" && styles.switchBtnActive)}
                  aria-pressed={platform === "ios"}
                  onClick={() => pickPlatform("ios")}
                >
                  <AppleIcon size={16} />
                  iPhone / iPad
                </button>
                <button
                  type="button"
                  className={cx(styles.switchBtn, platform === "android" && styles.switchBtnActive)}
                  aria-pressed={platform === "android"}
                  onClick={() => pickPlatform("android")}
                >
                  <AndroidIcon size={16} />
                  Android
                </button>
              </div>
              {autoDetected && (
                <span className={styles.detectHint}>
                  Detectamos seu aparelho — troque se estiver errado.
                </span>
              )}
            </div>

            {!isPhone && (
              <div className={cx(styles.callout, styles.calloutInfo)}>
                <span className={styles.calloutIcon}>
                  <InfoIcon />
                </span>
                <span className={styles.calloutText}>
                  Parece que você está no computador. O app faz diferença mesmo é no celular — abra{" "}
                  <strong>czero.sbs/instalar</strong> por lá e siga os passos abaixo.
                </span>
              </div>
            )}
          </>
        )}

        {stepsVisible && (
          <Card padding="none">
            <ol className={styles.stepsList} key={platform}>
              {steps.map((step, i) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber}>{String(i + 1).padStart(2, "0")}</span>
                  <div className={styles.stepContent}>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={styles.stepText}>{step.text}</span>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>

      {/* ══════════ PASSO 02 — Notificações ══════════ */}
      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionLabel}>Passo 02</span>
          <div className={styles.sectionTitleRow}>
            <h2 className={styles.sectionTitle}>Ligar as notificações</h2>
            {pushStatus === "granted" && (
              <Badge variant="success" size="md" dot>
                Ativas
              </Badge>
            )}
          </div>
        </div>

        <Card padding="lg">
          <div className={styles.pushCard}>
            <div className={styles.pushHead}>
              <span className={cx(styles.pushIcon, pushStatus === "granted" && styles.pushIconOn)}>
                <BellIcon />
              </span>
              <div className={styles.pushBody}>
                <span className={styles.pushTitle}>Avisos do Código Zero</span>
                <span className={styles.pushText} role="status">
                  {pushHint}
                </span>
              </div>
            </div>

            {pushStatus !== "granted" && (
              <ul className={styles.benefits}>
                {PUSH_BENEFITS.map((b) => (
                  <li key={b} className={styles.benefit}>
                    <span className={styles.benefitIcon}>
                      <CheckIcon size={14} />
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {pushStatus === "denied" && (
              <div className={cx(styles.callout, styles.calloutWarning)}>
                <span className={styles.calloutIcon}>
                  <AlertIcon />
                </span>
                <div className={styles.calloutBody}>
                  <span className={styles.calloutTitle}>O botão daqui não resolve</span>
                  <span className={styles.calloutText}>
                    Você (ou o navegador) bloqueou as notificações antes. Precisa liberar nas
                    configurações: {UNBLOCK_HINT[platform]}
                  </span>
                </div>
              </div>
            )}

            {needsInstallForPush && (
              <div className={cx(styles.callout, styles.calloutInfo)}>
                <span className={styles.calloutIcon}>
                  <InfoIcon />
                </span>
                <span className={styles.calloutText}>
                  A Apple só libera notificações para apps na tela inicial. Faça o{" "}
                  <strong>Passo 01</strong>, abra o Código Zero pelo ícone e volte aqui — o botão vai
                  funcionar.
                </span>
              </div>
            )}

            <div className={styles.pushActions}>
              {pushStatus === "granted" ? (
                <span className={styles.pushDone}>
                  <CheckIcon size={16} /> Notificações ativas neste aparelho
                </span>
              ) : pushStatus === "unsupported" ? (
                needsInstallForPush ? null : (
                  <Badge variant="neutral" size="md">
                    Indisponível neste navegador
                  </Badge>
                )
              ) : (
                <Button
                  variant="accent"
                  size="lg"
                  fullWidth
                  iconStart={<BellIcon size={18} />}
                  loading={pushStatus === "loading"}
                  onClick={handleActivatePush}
                >
                  {pushStatus === "denied"
                    ? "Já liberei — tentar de novo"
                    : pushStatus === "error"
                      ? "Tentar de novo"
                      : "Ativar notificações"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </section>

      {/* ══════════ Saída ══════════ */}
      <div className={styles.footerCta}>
        <Button variant="primary" size="lg" fullWidth onClick={() => router.push("/dashboard")}>
          {installed ? "Ir para o dashboard" : "Já instalei"}
        </Button>
        <span className={styles.footerHint}>
          Travou em algum passo? Fale com a gente no Suporte — a gente destrava com você.
        </span>
      </div>
    </div>
  );
}
