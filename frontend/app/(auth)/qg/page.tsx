"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { PageHeader, Card, Button } from "@/components/ui";
import styles from "./qg.module.css";

interface QgInfo {
  community?: { link?: string };
  mentoria?: { nextSession?: string; link?: string };
}

const DiscordSvg = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 71 55" fill="currentColor" aria-hidden>
    <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1A59.7 59.7 0 00.2 42.8a.2.2 0 000 .2 58.8 58.8 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 010-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.7 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.2.1A58.6 58.6 0 0070.6 43a.2.2 0 000-.2 59.2 59.2 0 00-10.2-38c0 0-.1 0-.1-.1zM23.7 35.1c-3.3 0-6-3-6-6.7s2.7-6.7 6-6.7 6.1 3 6 6.7c0 3.7-2.7 6.7-6 6.7zm22.2 0c-3.3 0-6-3-6-6.7s2.6-6.7 6-6.7 6 3 6 6.7-2.7 6.7-6 6.7z" />
  </svg>
);

const Mic = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M19 11a7 7 0 01-14 0M12 18v3" />
  </svg>
);

const ExternalLink = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const pad = (n: number) => String(n).padStart(2, "0");

export default function QGPage() {
  const [info, setInfo] = useState<QgInfo | null>(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });

  useEffect(() => {
    apiClient
      .getQGInfo()
      .then(setInfo)
      .catch((e) => console.error("Failed:", e));
  }, []);

  useEffect(() => {
    if (!info?.mentoria?.nextSession) return;
    const target = new Date(info.mentoria.nextSession).getTime();
    const tick = () => {
      const diff = Math.max(0, target - Date.now());
      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        mins: Math.floor((diff / (1000 * 60)) % 60),
        secs: Math.floor((diff / 1000) % 60),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [info]);

  const sessionDate = info?.mentoria?.nextSession
    ? new Date(info.mentoria.nextSession).toLocaleString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className={styles.page}>
      <PageHeader
        label="Comunidade · QG"
        title="Sua rede de apoio"
        description="Comunidade, mentorias ao vivo e suporte direto. O QG é onde você não avança sozinho."
      />

      <div className={styles.grid}>
        {/* ── Community card ── */}
        <Card padding="lg">
          <div className={styles.cardBody}>
            <div className={styles.cardHead}>
              <span className={`${styles.cardIcon} ${styles.discordIcon}`}>
                <DiscordSvg size={20} />
              </span>
              <div>
                <h2 className={styles.cardTitle}>Comunidade no Discord</h2>
                <p className={styles.cardDesc}>
                  Conecte-se com outros membros, tire dúvidas, compartilhe ganhos.
                </p>
              </div>
            </div>

            <div className={styles.spacer} />

            <div className={styles.cardActions}>
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  const link = info?.community?.link || "https://discord.gg/codigozero";
                  window.open(link, "_blank", "noopener,noreferrer");
                }}
                iconEnd={<ExternalLink size={14} />}
              >
                Entrar no Discord
              </Button>
            </div>
          </div>
        </Card>

        {/* ── Mentoria card ── */}
        <Card padding="lg">
          <div className={styles.cardBody}>
            <div className={styles.cardHead}>
              <span className={`${styles.cardIcon} ${styles.mentoriaIcon}`}>
                <Mic size={18} />
              </span>
              <div>
                <h2 className={styles.cardTitle}>Próxima mentoria ao vivo</h2>
                <p className={styles.cardDesc}>Sessão semanal de perguntas e respostas com o time.</p>
              </div>
            </div>

            {info?.mentoria?.nextSession ? (
              <>
                <div className={styles.countdown}>
                  <div className={styles.countdownBlock}>
                    <span className={styles.countdownValue}>{pad(countdown.days)}</span>
                    <span className={styles.countdownLabel}>Dias</span>
                  </div>
                  <span className={styles.countdownSep}>:</span>
                  <div className={styles.countdownBlock}>
                    <span className={styles.countdownValue}>{pad(countdown.hours)}</span>
                    <span className={styles.countdownLabel}>Horas</span>
                  </div>
                  <span className={styles.countdownSep}>:</span>
                  <div className={styles.countdownBlock}>
                    <span className={styles.countdownValue}>{pad(countdown.mins)}</span>
                    <span className={styles.countdownLabel}>Min</span>
                  </div>
                  <span className={styles.countdownSep}>:</span>
                  <div className={styles.countdownBlock}>
                    <span className={styles.countdownValue}>{pad(countdown.secs)}</span>
                    <span className={styles.countdownLabel}>Seg</span>
                  </div>
                </div>

                {sessionDate && <div className={styles.scheduleLine}>{sessionDate}</div>}

                {info.mentoria.link && (
                  <div className={styles.cardActions}>
                    <Button
                      variant="primary"
                      size="lg"
                      fullWidth
                      onClick={() => window.open(info.mentoria!.link!, "_blank", "noopener,noreferrer")}
                      iconEnd={<ExternalLink size={14} />}
                    >
                      Acessar mentoria
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.noMentoria}>
                Nenhuma mentoria agendada por aqui. Fique de olho no Discord — a próxima é anunciada por lá.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
