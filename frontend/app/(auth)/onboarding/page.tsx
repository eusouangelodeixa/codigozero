"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import styles from "./onboarding.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const TOTAL_STEPS = 5;

const iosSteps = [
  "Abra no Safari → toque no ícone ⬆️ Compartilhar",
  "Selecione \"Adicionar à Tela de Início\"",
  "Confirme o nome e toque em Adicionar",
];
const androidSteps = [
  "Abra no Chrome → toque nos 3 pontos ⋮",
  "Selecione \"Adicionar à tela inicial\"",
  "Confirme e toque em Instalar",
];

const features = [
  { icon: "🔍", name: "Radar", desc: "Encontre leads automaticamente" },
  { icon: "🚀", name: "Disparador", desc: "Envio em massa via WhatsApp" },
  { icon: "📂", name: "Cofre de Scripts", desc: "Seus scripts organizados" },
  { icon: "🎓", name: "Aulas", desc: "Conteúdo exclusivo do curso" },
  { icon: "💬", name: "Comunidade", desc: "Chat com outros alunos" },
  { icon: "🛟", name: "Suporte", desc: "Ajuda direta com a equipe" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [userName, setUserName] = useState("");
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem("cz_user");
    if (cached) {
      try {
        const u = JSON.parse(cached);
        setUserName(u.name?.split(" ")[0] || "");
        if (u.hasCompletedOnboarding) {
          router.replace("/dashboard");
        }
      } catch {}
    }
  }, [router]);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const prev = () => setStep(s => Math.max(s - 1, 1));

  const finish = async () => {
    setFinishing(true);
    try {
      await fetch(`${API}/api/auth/onboarding-complete`, {
        method: "PATCH",
        headers: hdr(),
      });
      // Update cached user
      const cached = localStorage.getItem("cz_user");
      if (cached) {
        const u = JSON.parse(cached);
        u.hasCompletedOnboarding = true;
        localStorage.setItem("cz_user", JSON.stringify(u));
      }
    } catch {}
    router.replace("/dashboard");
  };

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className={styles.onboardingOverlay}>
      <div className={styles.onboardingCard}>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className={styles.cardBody} key="s1">
            <div className={styles.stepLabel}>Passo 1 de {TOTAL_STEPS}</div>
            <h1 className={styles.stepTitle}>
              Bem-vindo ao Código Zero{userName ? `, ${userName}` : ""}! 🎉
            </h1>
            <p className={styles.stepText}>
              Você acabou de entrar na plataforma que vai transformar como você cria e vende micronegócios de IA.
              <br /><br />
              Aqui você vai aprender a gerar seus primeiros 50.000 MT/mês usando automações inteligentes — sem escrever uma linha de código.
              <br /><br />
              Vamos configurar tudo em poucos passos. Leva menos de 2 minutos!
            </p>
          </div>
        )}

        {/* Step 2: Profile */}
        {step === 2 && (
          <div className={styles.cardBody} key="s2">
            <div className={styles.stepLabel}>Passo 2 de {TOTAL_STEPS}</div>
            <h1 className={styles.stepTitle}>📸 Configure seu Perfil</h1>
            <p className={styles.stepText}>
              Seu perfil é como os outros alunos e a equipe de suporte vão te reconhecer na comunidade.
            </p>

            <div className={styles.inputGroup}>
              <label className={styles.inputLabel}>Seu nome</label>
              <input className={styles.input} value={userName} readOnly
                style={{ opacity: 0.6 }} />
              <span style={{ fontSize: 11, color: "#666", marginTop: 4, display: "block" }}>
                Para alterar, acesse Meu Perfil após o onboarding
              </span>
            </div>

            <div style={{ padding: 16, borderRadius: 12, background: "rgba(45,212,191,0.04)", border: "1px solid rgba(45,212,191,0.1)", fontSize: 13, color: "#aaa", lineHeight: 1.6 }}>
              <strong style={{ color: "#2DD4BF" }}>💡 Dica:</strong> Depois de finalizar, vá em <strong>Meu Perfil</strong> para adicionar sua foto, que aparecerá no sidebar e na comunidade.
            </div>
          </div>
        )}

        {/* Step 3: Komunika */}
        {step === 3 && (
          <div className={styles.cardBody} key="s3">
            <div className={styles.stepLabel}>Passo 3 de {TOTAL_STEPS}</div>
            <h1 className={styles.stepTitle}>🔗 Conecte o WhatsApp</h1>
            <p className={styles.stepText}>
              O <strong style={{ color: "#2DD4BF" }}>Komunika</strong> é nosso sistema de automação de WhatsApp. Com ele, você pode:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {[
                "📨 Enviar mensagens em massa para leads",
                "🤖 Automatizar prospecção e remarketing",
                "📊 Rastrear todas as conversas no histórico",
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: "#ccc" }}>
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: 14, borderRadius: 10, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)", fontSize: 12, color: "#f59e0b", lineHeight: 1.5 }}>
              ⚡ Não se preocupe se não tiver agora. Pode configurar depois em <strong>Integrações</strong>.
            </div>

            <button className={styles.skipBtn} onClick={() => router.push("/integracoes")}>
              Ir para Integrações agora →
            </button>
          </div>
        )}

        {/* Step 4: Install App */}
        {step === 4 && (
          <div className={styles.cardBody} key="s4">
            <div className={styles.stepLabel}>Passo 4 de {TOTAL_STEPS}</div>
            <h1 className={styles.stepTitle}>📲 Instale o App</h1>
            <p className={styles.stepText}>
              Adicione o Código Zero à sua tela inicial para ter acesso rápido e receber notificações push.
            </p>

            <div className={styles.platformRow}>
              <button className={`${styles.platformBtn} ${platform === "ios" ? styles.platformBtnActive : ""}`}
                onClick={() => setPlatform("ios")}>
                <span style={{ fontSize: "1.8rem" }}>🍎</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginTop: 4 }}>iPhone</div>
              </button>
              <button className={`${styles.platformBtn} ${platform === "android" ? styles.platformBtnActive : ""}`}
                onClick={() => setPlatform("android")}>
                <span style={{ fontSize: "1.8rem" }}>🤖</span>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginTop: 4 }}>Android</div>
              </button>
            </div>

            {platform && (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                {(platform === "ios" ? iosSteps : androidSteps).map((s, i) => (
                  <div key={i} className={styles.miniStep}>
                    <div className={styles.miniStepNum}>{i + 1}</div>
                    <div className={styles.miniStepText}>{s}</div>
                  </div>
                ))}
              </div>
            )}

            <button className={styles.skipBtn} onClick={next}>
              Fazer isso depois →
            </button>
          </div>
        )}

        {/* Step 5: Tour */}
        {step === 5 && (
          <div className={styles.cardBody} key="s5">
            <div className={styles.stepLabel}>Passo 5 de {TOTAL_STEPS}</div>
            <h1 className={styles.stepTitle}>🎯 Tudo Pronto!</h1>
            <p className={styles.stepText}>
              Aqui está o que você tem à disposição na plataforma:
            </p>

            <div className={styles.featureGrid}>
              {features.map((f, i) => (
                <div key={i} className={styles.featureCard}>
                  <span className={styles.featureIcon}>{f.icon}</span>
                  <div className={styles.featureName}>{f.name}</div>
                  <div className={styles.featureDesc}>{f.desc}</div>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 13, color: "#888", textAlign: "center", lineHeight: 1.5 }}>
              Comece pelo <strong style={{ color: "#2DD4BF" }}>Dashboard</strong> para ver sua visão geral, ou vá direto ao <strong style={{ color: "#2DD4BF" }}>Radar</strong> para encontrar seus primeiros leads! 🚀
            </p>
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          {step > 1 && step < TOTAL_STEPS && (
            <button className={styles.btnSecondary} onClick={prev}>← Voltar</button>
          )}
          {step < TOTAL_STEPS ? (
            <button className={styles.btnPrimary} onClick={next}>
              {step === 1 ? "Vamos lá! 🚀" : "Próximo →"}
            </button>
          ) : (
            <button className={styles.btnPrimary} onClick={finish} disabled={finishing}>
              {finishing ? "Finalizando..." : "Começar! 🎉"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
