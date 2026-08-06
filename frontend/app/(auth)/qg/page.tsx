"use client";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { PageHeader, Card, Button } from "@/components/ui";
import styles from "./qg.module.css";

interface QgInfo {
  community?: { link?: string };
  whatsappGroup?: { link?: string | null };
  mentoria?: { nextSession?: string; link?: string };
}

const DiscordSvg = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 71 55" fill="currentColor" aria-hidden>
    <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1A59.7 59.7 0 00.2 42.8a.2.2 0 000 .2 58.8 58.8 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 010-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.7 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.2.1A58.6 58.6 0 0070.6 43a.2.2 0 000-.2 59.2 59.2 0 00-10.2-38c0 0-.1 0-.1-.1zM23.7 35.1c-3.3 0-6-3-6-6.7s2.7-6.7 6-6.7 6.1 3 6 6.7c0 3.7-2.7 6.7-6 6.7zm22.2 0c-3.3 0-6-3-6-6.7s2.6-6.7 6-6.7 6 3 6 6.7-2.7 6.7-6 6.7z" />
  </svg>
);

const WhatsAppSvg = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.22 1.36.19 1.87.11.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.05 21.79h-.01a9.8 9.8 0 01-5-1.37l-.36-.21-3.72.97.99-3.62-.23-.37a9.77 9.77 0 01-1.5-5.23c0-5.41 4.41-9.81 9.83-9.81a9.76 9.76 0 016.95 2.88 9.75 9.75 0 012.88 6.95c0 5.41-4.41 9.81-9.83 9.81zm8.36-18.17A11.71 11.71 0 0012.05.2C5.55.2.26 5.48.26 11.97c0 2.08.54 4.1 1.57 5.89L.16 23.95l6.24-1.63a11.8 11.8 0 005.64 1.43h.01c6.5 0 11.79-5.28 11.79-11.77 0-3.15-1.23-6.1-3.46-8.32z" />
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
        label="Conexão · Comunidades"
        title="Comunidades"
        description="Discord, grupo exclusivo no WhatsApp e mentorias ao vivo — é aqui que você não avança sozinho."
      />

      <div className={styles.grid}>
        {/* ── Community card (ocupa a linha toda quando o grupo do WhatsApp
             não está configurado — senão os dois dividem a primeira linha) ── */}
        <Card padding="lg" className={info?.whatsappGroup?.link ? undefined : styles.fullCard}>
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

        {/* ── Grupo do WhatsApp exclusivo de membros ── */}
        {info?.whatsappGroup?.link && (
          <Card padding="lg">
            <div className={styles.cardBody}>
              <div className={styles.cardHead}>
                <span className={`${styles.cardIcon} ${styles.whatsappIcon}`}>
                  <WhatsAppSvg size={20} />
                </span>
                <div>
                  <h2 className={styles.cardTitle}>Grupo exclusivo no WhatsApp</h2>
                  <p className={styles.cardDesc}>
                    Só pra membros com assinatura ativa. O grupo é privado — pede pra entrar e o Ângelo aprova.
                  </p>
                </div>
              </div>

              <div className={styles.spacer} />

              <div className={styles.cardActions}>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => {
                    window.open(info.whatsappGroup!.link!, "_blank", "noopener,noreferrer");
                  }}
                  iconEnd={<ExternalLink size={14} />}
                >
                  Entrar no grupo
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Mentoria card — sempre linha inteira (o countdown respira) ── */}
        <Card padding="lg" className={styles.fullCard}>
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
