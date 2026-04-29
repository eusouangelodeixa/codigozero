"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
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
