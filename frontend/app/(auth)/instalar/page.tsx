"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { subscribeToPush } from "@/lib/pushNotifications";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import styles from "./instalar.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const iosSteps: { title: string; text: ReactNode }[] = [
  { title: "Abra no Safari", text: <>Use o <span className={styles.stepHighlight}>Safari</span> (navegador padrão do iPhone).</> },
  { title: "Toque em Compartilhar", text: <>Na barra inferior, toque no ícone <span className={styles.stepHighlight}>Compartilhar</span>.</> },
  { title: "Adicionar à Tela de Início", text: <>Role e toque em <span className={styles.stepHighlight}>Adicionar à Tela de Início</span>.</> },
  { title: "Confirme o nome", text: <>O nome será "Código Zero". Toque em <span className={styles.stepHighlight}>Adicionar</span>.</> },
  { title: "Pronto!", text: "O ícone aparece na tela inicial. Abra para a experiência completa." },
];

const androidSteps: { title: string; text: ReactNode }[] = [
  { title: "Abra no Chrome", text: <>Use o <span className={styles.stepHighlight}>Google Chrome</span>.</> },
  { title: "Toque no menu ⋮", text: <>No canto superior direito, toque nos <span className={styles.stepHighlight}>3 pontos</span>.</> },
  { title: "Adicionar à tela inicial", text: <>Toque em <span className={styles.stepHighlight}>Adicionar à tela inicial</span> ou "Instalar app".</> },
  { title: "Confirme", text: <>Toque em <span className={styles.stepHighlight}>Instalar</span> ou "Adicionar".</> },
  { title: "Pronto!", text: "O ícone aparece na tela inicial como um app nativo." },
];

const BellIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

export default function InstalarPage() {
  const router = useRouter();
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [pushStatus, setPushStatus] = useState<"idle" | "loading" | "granted" | "denied" | "unsupported" | "error">("idle");
  const [pushError, setPushError] = useState("");

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

  const steps = platform === "ios" ? iosSteps : platform === "android" ? androidSteps : [];

  const pushSubtitle = (() => {
    switch (pushStatus) {
      case "granted":     return "Notificações ativas. Você receberá alertas importantes.";
      case "denied":      return "Notificações bloqueadas. Habilite nas configurações do navegador.";
      case "unsupported": return "Seu navegador não suporta notificações push.";
      case "error":       return pushError || "Falha ao ativar. Tente novamente.";
      default:            return "Ative para receber alertas de aulas, comunidade e novidades.";
    }
  })();

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Instalar"
        title="Instalar o app"
        description="O Código Zero funciona como um app nativo. Adicione à tela inicial para experiência completa e notificações."
      />

      {/* ── Push notifications ── */}
      <Card padding="lg">
        <div className={styles.pushCard}>
          <span className={styles.pushIcon}><BellIcon /></span>
          <div className={styles.pushBody}>
            <span className={styles.pushTitle}>Notificações push</span>
            <span className={styles.pushHint}>{pushSubtitle}</span>
          </div>
          {pushStatus === "granted" ? (
            <Badge variant="success" size="md" dot>Ativas</Badge>
          ) : pushStatus === "denied" || pushStatus === "unsupported" ? (
            <Badge variant="error" size="md">Indisponível</Badge>
          ) : (
            <Button
              variant="accent"
              onClick={handleActivatePush}
              loading={pushStatus === "loading"}
            >
              {pushStatus === "error" ? "Tentar de novo" : "Ativar notificações"}
            </Button>
          )}
        </div>
      </Card>

      {/* ── Platform picker ── */}
      <div className={styles.platformPicker}>
        <button
          type="button"
          className={cx(styles.platformBtn, platform === "ios" && styles.platformBtnActive)}
          onClick={() => setPlatform("ios")}
        >
          <span className={styles.platformEmoji}>🍎</span>
          <span className={styles.platformLabel}>iPhone / iPad</span>
        </button>
        <button
          type="button"
          className={cx(styles.platformBtn, platform === "android" && styles.platformBtnActive)}
          onClick={() => setPlatform("android")}
        >
          <span className={styles.platformEmoji}>🤖</span>
          <span className={styles.platformLabel}>Android</span>
        </button>
      </div>

      {/* ── Steps ── */}
      {platform && (
        <>
          <div className={styles.stepsList} key={platform}>
            {steps.map((step, i) => (
              <div key={i} className={styles.step}>
                <span className={styles.stepNumber}>{String(i + 1).padStart(2, "0")}</span>
                <div className={styles.stepContent}>
                  <span className={styles.stepTitle}>{step.title}</span>
                  <span className={styles.stepText}>{step.text}</span>
                </div>
              </div>
            ))}
          </div>
          <Button variant="primary" size="lg" fullWidth onClick={() => router.push("/dashboard")}>
            Já instalei
          </Button>
        </>
      )}
    </div>
  );
}
