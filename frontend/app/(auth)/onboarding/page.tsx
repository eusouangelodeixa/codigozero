"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/ui";
import styles from "./onboarding.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const TOTAL_STEPS = 5;

const iosSteps = [
  "Abra no Safari → toque no ícone Compartilhar",
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
  { icon: "📂", name: "Cofre", desc: "Scripts organizados" },
  { icon: "🎓", name: "Forja", desc: "Aulas exclusivas" },
  { icon: "💬", name: "Comunidade", desc: "Chat com outros alunos" },
  { icon: "🛟", name: "Suporte", desc: "Mentor direto" },
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
        if (u.hasCompletedOnboarding) router.replace("/dashboard");
      } catch {}
    }
  }, [router]);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const prev = () => setStep((s) => Math.max(s - 1, 1));

  const finish = async () => {
    setFinishing(true);
    try {
      await fetch(`${API}/api/auth/onboarding-complete`, {
        method: "PATCH",
        headers: hdr(),
      });
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
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true">
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.body}>
          <span className={styles.eyebrow}>Passo {step} de {TOTAL_STEPS}</span>

          {step === 1 && (
            <>
              <h1 className={styles.title}>
                Bem-vindo ao Código Zero{userName ? `, ${userName}` : ""}.
              </h1>
              <p className={styles.text}>
                Você entrou na plataforma que transforma como criar e vender micronegócios de IA.
                Aqui você aprende a gerar seus primeiros 50.000 MT/mês com automações inteligentes — sem escrever uma linha de código.
              </p>
              <div className={cx(styles.callout, styles.calloutAccent)}>
                Vamos configurar tudo em menos de 2 minutos.
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className={styles.title}>Configure seu perfil</h1>
              <p className={styles.text}>
                É como os outros alunos e o time de suporte vão te reconhecer na comunidade.
              </p>
              <Input label="Seu nome" value={userName} readOnly hint="Para alterar, acesse Meu Perfil após o onboarding." />
              <div className={cx(styles.callout, styles.calloutAccent)}>
                Depois de finalizar, vá em <strong>Perfil</strong> para adicionar sua foto — ela aparece no sidebar e na comunidade.
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={styles.title}>Conecte o WhatsApp</h1>
              <p className={styles.text}>
                O <strong style={{ color: "var(--accent)" }}>Komunika</strong> é o motor de automação de WhatsApp. Com ele você pode:
              </p>
              <div className={styles.featureList}>
                <div className={styles.featureItem}>📨 Enviar mensagens em massa para leads</div>
                <div className={styles.featureItem}>🤖 Automatizar prospecção e remarketing</div>
                <div className={styles.featureItem}>📊 Rastrear todas as conversas no histórico</div>
              </div>
              <div className={cx(styles.callout, styles.calloutWarning)}>
                Pode configurar depois em <strong>Integrações</strong>, sem perder o acesso a nada.
              </div>
              <button type="button" className={styles.skipLink} onClick={() => router.push("/integracoes")}>
                Ir para Integrações agora →
              </button>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className={styles.title}>Instale o app</h1>
              <p className={styles.text}>
                Adicione o Código Zero à tela inicial para acesso rápido e notificações push.
              </p>
              <div className={styles.platformRow}>
                <button
                  type="button"
                  className={cx(styles.platformBtn, platform === "ios" && styles.platformBtnActive)}
                  onClick={() => setPlatform("ios")}
                >
                  <span className={styles.platformEmoji}>🍎</span>
                  <span className={styles.platformLabel}>iPhone</span>
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
              {platform && (
                <div className={styles.miniSteps} key={platform}>
                  {(platform === "ios" ? iosSteps : androidSteps).map((s, i) => (
                    <div key={i} className={styles.miniStep}>
                      <span className={styles.miniStepNum}>{i + 1}</span>
                      <span className={styles.miniStepText}>{s}</span>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className={styles.skipLink} onClick={next}>
                Fazer isso depois →
              </button>
            </>
          )}

          {step === 5 && (
            <>
              <h1 className={styles.title}>Tudo pronto.</h1>
              <p className={styles.text}>
                Aqui está o que você tem à disposição:
              </p>
              <div className={styles.featureGrid}>
                {features.map((f) => (
                  <div key={f.name} className={styles.featureCard}>
                    <span className={styles.featureIcon}>{f.icon}</span>
                    <span className={styles.featureName}>{f.name}</span>
                    <span className={styles.featureDesc}>{f.desc}</span>
                  </div>
                ))}
              </div>
              <p className={styles.text} style={{ textAlign: "center", fontSize: "var(--type-small)" }}>
                Comece pelo <strong style={{ color: "var(--accent)" }}>Dashboard</strong> para a visão geral, ou vá direto ao <strong style={{ color: "var(--accent)" }}>Radar</strong> para os primeiros leads.
              </p>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerLeft}>
            {step}/{TOTAL_STEPS}
          </span>
          <div className={styles.footerRight}>
            {step > 1 && step < TOTAL_STEPS && (
              <Button variant="secondary" onClick={prev}>← Voltar</Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button variant="primary" onClick={next}>
                {step === 1 ? "Vamos lá" : "Próximo"}
              </Button>
            ) : (
              <Button variant="primary" onClick={finish} loading={finishing}>
                Começar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
