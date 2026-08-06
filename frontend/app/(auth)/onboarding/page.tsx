"use client";
// Onboarding guiado de novos membros — estilo produto de empresa grande:
// boas-vindas → mapa da plataforma → WhatsApp → app instalado → escolha
// entre TOUR GUIADO no dashboard ou explorar sozinho.
//
// Teste sem tocar na conta: /onboarding?preview=1 abre sempre (mesmo com o
// onboarding concluído) e o final NÃO marca como completo.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
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

// O mapa da plataforma — mesmos nomes do menu, pra criar memória espacial.
const features = [
  { icon: "🛰️", name: "Radar", desc: "Encontra leads no Google Maps por nicho e cidade" },
  { icon: "🚀", name: "Disparador", desc: "Campanhas no WhatsApp com ritmo seguro" },
  { icon: "🗄️", name: "Cofre", desc: "Scripts prontos de venda e abordagem" },
  { icon: "🎓", name: "Cursos", desc: "Área de membros com aulas e materiais" },
  { icon: "🌐", name: "Comunidades", desc: "Discord, grupo no WhatsApp e mentorias ao vivo" },
  { icon: "🛟", name: "Suporte", desc: "Canal direto com a equipe, dentro do app" },
];

const valueBullets = [
  { icon: "🎯", text: "Encontrar clientes reais em minutos com o Radar" },
  { icon: "🤖", text: "Vender serviços de IA sem escrever uma linha de código" },
  { icon: "🤝", text: "Aprender com aulas, mentorias ao vivo e a comunidade" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [userName, setUserName] = useState("");
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    const isPreview = new URLSearchParams(window.location.search).get("preview") === "1";
    setPreview(isPreview);
    const cached = localStorage.getItem("cz_user");
    if (cached) {
      try {
        const u = JSON.parse(cached);
        setUserName(u.name?.split(" ")[0] || "");
        if (u.hasCompletedOnboarding && !isPreview) router.replace("/dashboard");
      } catch {}
    }
  }, [router]);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const prev = () => setStep((s) => Math.max(s - 1, 1));

  // Finaliza. `withTour` decide se o dashboard abre já com o tour guiado.
  // Em preview NADA é gravado no perfil — só navega.
  const finish = async (withTour: boolean) => {
    setFinishing(true);
    try {
      if (!preview) {
        await fetch(`${API}/api/auth/onboarding-complete`, { method: "PATCH", headers: hdr() });
        const cached = localStorage.getItem("cz_user");
        if (cached) {
          const u = JSON.parse(cached);
          u.hasCompletedOnboarding = true;
          localStorage.setItem("cz_user", JSON.stringify(u));
        }
      }
      if (withTour) localStorage.setItem("cz_tour_pending", "1");
    } catch {}
    router.replace(withTour ? "/dashboard?tour=1" : "/dashboard");
  };

  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className={styles.overlay}>
      <div className={styles.card} role="dialog" aria-modal="true">
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.body}>
          <span className={styles.eyebrow}>
            {preview ? "Pré-visualização · " : ""}Passo {step} de {TOTAL_STEPS}
          </span>

          {step === 1 && (
            <>
              <h1 className={styles.title}>
                Bem-vindo ao Código Zero{userName ? `, ${userName}` : ""} 👋
              </h1>
              <p className={styles.text}>
                A partir de agora você tem uma operação completa pra criar e vender
                micronegócios de IA — e nós vamos te mostrar exatamente como usar cada peça.
              </p>
              <div className={styles.featureList}>
                {valueBullets.map((b) => (
                  <div key={b.text} className={styles.featureItem}>{b.icon} {b.text}</div>
                ))}
              </div>
              <div className={cx(styles.callout, styles.calloutAccent)}>
                Leva 2 minutos — e no final você escolhe entre um tour guiado pela
                plataforma ou explorar por conta própria.
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className={styles.title}>O mapa da plataforma</h1>
              <p className={styles.text}>
                Seis áreas, cada uma com um papel claro. São os mesmos nomes que você
                vai ver no menu:
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
            </>
          )}

          {step === 3 && (
            <>
              <h1 className={styles.title}>Conecte o WhatsApp</h1>
              <p className={styles.text}>
                O <strong style={{ color: "var(--accent)" }}>Komunika</strong> é o motor de
                automação de WhatsApp da plataforma. Com ele você pode:
              </p>
              <div className={styles.featureList}>
                <div className={styles.featureItem}>📨 Enviar mensagens em massa para leads</div>
                <div className={styles.featureItem}>🤖 Automatizar prospecção e remarketing</div>
                <div className={styles.featureItem}>📊 Rastrear todas as conversas no histórico</div>
              </div>
              <div className={cx(styles.callout, styles.calloutWarning)}>
                Pode configurar depois em <strong>Ferramentas</strong>, sem perder o acesso a nada.
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className={styles.title}>Instale o app</h1>
              <p className={styles.text}>
                Adicione o Código Zero à tela inicial para acesso em 1 toque e
                notificações de aulas novas, mentorias e avisos.
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
              <h1 className={styles.title}>Pronto. Como prefere começar?</h1>
              <p className={styles.text}>
                Recomendamos o <strong style={{ color: "var(--accent)" }}>tour guiado</strong>:
                em 1 minuto a plataforma te mostra cada área, passo a passo, na tela real —
                do jeito que os melhores produtos fazem.
              </p>
              <div className={styles.featureList}>
                <div className={styles.featureItem}>✨ Tour interativo: destaca cada área e explica pra que serve</div>
                <div className={styles.featureItem}>⏱️ Leva 1 minuto — e você pode rever quando quiser</div>
              </div>
            </>
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.footerLeft}>
            {step}/{TOTAL_STEPS}
          </span>
          <div className={styles.footerRight}>
            {step > 1 && (
              <Button variant="secondary" onClick={prev}>← Voltar</Button>
            )}
            {step < TOTAL_STEPS ? (
              <Button variant="primary" onClick={next}>
                {step === 1 ? "Vamos lá" : "Próximo"}
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => finish(false)} disabled={finishing}>
                  Explorar sozinho
                </Button>
                <Button variant="primary" onClick={() => finish(true)} loading={finishing}>
                  ✨ Fazer o tour guiado
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
