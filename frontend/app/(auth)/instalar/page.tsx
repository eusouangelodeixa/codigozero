"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeToPush } from "@/lib/pushNotifications";
import styles from "./instalar.module.css";

const iosSteps = [
  { title: "Abra no Safari", text: <>Certifique-se de estar usando o <span className={styles.stepHighlight}>Safari</span> (navegador padrão do iPhone).</> },
  { title: "Toque no botão Compartilhar", text: <>Na barra inferior, toque no ícone <span className={styles.stepHighlight}>⬆️ Compartilhar</span> (quadrado com seta para cima).</> },
  { title: "Adicionar à Tela de Início", text: <>Role para baixo e toque em <span className={styles.stepHighlight}>Adicionar à Tela de Início</span>.</> },
  { title: "Confirme o nome", text: <>O nome será "Código Zero - Aluno". Toque em <span className={styles.stepHighlight}>Adicionar</span>.</> },
  { title: "Pronto!", text: "O ícone do Código Zero aparecerá na sua tela inicial. Abra-o para ter a experiência completa de app!" },
];

const androidSteps = [
  { title: "Abra no Chrome", text: <>Certifique-se de estar usando o <span className={styles.stepHighlight}>Google Chrome</span>.</> },
  { title: "Toque no menu ⋮", text: <>No canto superior direito, toque nos <span className={styles.stepHighlight}>3 pontos ⋮</span>.</> },
  { title: "Adicionar à tela inicial", text: <>Toque em <span className={styles.stepHighlight}>Adicionar à tela inicial</span> ou "Instalar app".</> },
  { title: "Confirme", text: <>Toque em <span className={styles.stepHighlight}>Instalar</span> ou "Adicionar" na janela que aparecer.</> },
  { title: "Pronto!", text: "O ícone do Código Zero aparecerá na sua tela inicial como um app nativo!" },
];

export default function InstalarPage() {
  const router = useRouter();
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [pushStatus, setPushStatus] = useState<"idle" | "loading" | "granted" | "denied" | "unsupported" | "error">("idle");
  const [pushError, setPushError] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        setPushStatus("unsupported");
      } else if (Notification.permission === "granted") {
        // Check if already subscribed
        navigator.serviceWorker.ready.then(reg => {
          reg.pushManager.getSubscription().then(sub => {
            setPushStatus(sub ? "granted" : "idle");
          });
        }).catch(() => {});
      } else if (Notification.permission === "denied") {
        setPushStatus("denied");
      }
    }
  }, []);

  const handleActivatePush = async () => {
    setPushStatus("loading");
    setPushError("");
    try {
      const success = await subscribeToPush();
      if (success) {
        setPushStatus("granted");
      } else {
        setPushStatus("error");
        // Determine why it failed
        if (!("PushManager" in window)) {
          setPushError("PushManager não disponível. Adicione o app à tela inicial primeiro.");
        } else if (Notification.permission === "denied") {
          setPushError("Permissão negada. Vá às Configurações > Safari > Notificações.");
        } else if (Notification.permission === "default") {
          setPushError("Permissão não concedida. Tente novamente.");
        } else {
          setPushError("Falha ao registrar. Verifique sua conexão.");
        }
      }
    } catch (err: any) {
      setPushStatus("error");
      setPushError(err?.message || "Erro desconhecido");
    }
  };

  const steps = platform === "ios" ? iosSteps : platform === "android" ? androidSteps : [];

  return (
    <div className={styles.installPage}>
      <span style={{ fontSize: 11, color: "#2DD4BF", fontWeight: 500, letterSpacing: 1, textTransform: "uppercase" }}>
        Instalação
      </span>
      <h1 className={styles.installTitle}>📲 Instalar o App</h1>
      <p className={styles.installDesc}>
        O Código Zero funciona como um app nativo no seu celular. Siga os passos abaixo para adicionar à tela inicial e receber notificações.
      </p>

      {/* Push Notification Activation */}
      <div style={{
        background: "rgba(45, 212, 191, 0.06)",
        border: "1px solid rgba(45, 212, 191, 0.15)",
        borderRadius: 12,
        padding: "20px 24px",
        marginBottom: 24,
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, fontSize: "0.95rem" }}>
            🔔 Notificações Push
          </div>
          <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
            {pushStatus === "granted"
              ? "Notificações ativadas! Você receberá alertas importantes."
              : pushStatus === "denied"
              ? "Notificações bloqueadas. Vá às configurações do browser para permitir."
              : pushStatus === "unsupported"
              ? "Seu navegador não suporta notificações push."
              : pushStatus === "error"
              ? pushError || "Falha ao ativar. Tente novamente."
              : "Ative para receber alertas de aulas, promoções e novidades."}
          </div>
        </div>
        {(pushStatus === "idle" || pushStatus === "loading" || pushStatus === "error") ? (
          <button
            onClick={handleActivatePush}
            disabled={pushStatus === "loading"}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              background: pushStatus === "error" ? "linear-gradient(135deg, #F59E0B, #D97706)" : "linear-gradient(135deg, #2DD4BF, #14B8A6)",
              color: "#000",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: pushStatus === "loading" ? "wait" : "pointer",
              border: "none",
              opacity: pushStatus === "loading" ? 0.7 : 1,
              transition: "opacity 0.2s, transform 0.2s",
              whiteSpace: "nowrap",
            }}
          >
            {pushStatus === "loading" ? "Ativando..." : pushStatus === "error" ? "Tentar Novamente" : "Ativar Notificações"}
          </button>
        ) : pushStatus === "granted" ? (
          <span style={{ color: "#2DD4BF", fontWeight: 600, fontSize: "0.9rem" }}>✅ Ativas</span>
        ) : null}
      </div>

      <div className={styles.platformPicker}>
        <button
          className={`${styles.platformBtn} ${platform === "ios" ? styles.platformBtnActive : ""}`}
          onClick={() => setPlatform("ios")}
        >
          <span className={styles.platformIcon}>🍎</span>
          <span className={styles.platformLabel}>iPhone / iPad</span>
        </button>
        <button
          className={`${styles.platformBtn} ${platform === "android" ? styles.platformBtnActive : ""}`}
          onClick={() => setPlatform("android")}
        >
          <span className={styles.platformIcon}>🤖</span>
          <span className={styles.platformLabel}>Android</span>
        </button>
      </div>

      {platform && (
        <div className={styles.stepsContainer} key={platform}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: 16 }}>
            {platform === "ios" ? "Passo a passo — iPhone" : "Passo a passo — Android"}
          </h2>

          {steps.map((step, i) => (
            <div key={i} className={styles.stepCard}>
              <div className={styles.stepNumber}>{i + 1}</div>
              <div className={styles.stepContent}>
                <div className={styles.stepTitle}>{step.title}</div>
                <div className={styles.stepText}>{step.text}</div>
              </div>
            </div>
          ))}

          <button className={styles.doneBtn} onClick={() => router.push("/dashboard")}>
            ✅ Já instalei!
          </button>
        </div>
      )}
    </div>
  );
}

