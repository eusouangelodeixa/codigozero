"use client";
import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import styles from "./qg.module.css";

export default function QGPage() {
  const [info, setInfo] = useState<any>(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadInfo(); }, []);

  useEffect(() => {
    if (!info?.mentoria?.nextSession) return;
    const target = new Date(info.mentoria.nextSession).getTime();
    const interval = setInterval(() => {
      const diff = Math.max(0, target - Date.now());
      setCountdown({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        mins: Math.floor((diff / (1000 * 60)) % 60),
        secs: Math.floor((diff / 1000) % 60),
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [info]);

  const loadInfo = async () => {
    try { const data = await apiClient.getQGInfo(); setInfo(data); }
    catch (e) { console.error("Failed:", e); }
    finally { setLoading(false); }
  };

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className={styles.page}>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>O QG</span>
        <h1 className={styles.sectionTitle}>Central de comando</h1>
        <p className={styles.sectionDescription}>Comunidade, mentorias ao vivo e suporte direto.</p>
      </div>

      {/* Community */}
      <div className={styles.communityCard}>
        <div className={styles.communityHeader}>
          <div className={styles.discordIcon}>
            <svg width="24" height="24" viewBox="0 0 71 55" fill="white">
              <path d="M60.1 4.9A58.5 58.5 0 0045.4.2a.2.2 0 00-.2.1 40.8 40.8 0 00-1.8 3.7 54 54 0 00-16.2 0A37.3 37.3 0 0025.4.3a.2.2 0 00-.2-.1 58.4 58.4 0 00-14.7 4.6.2.2 0 00-.1.1A59.7 59.7 0 00.2 42.8a.2.2 0 000 .2 58.8 58.8 0 0017.7 9 .2.2 0 00.3-.1 42 42 0 003.6-5.9.2.2 0 00-.1-.3 38.8 38.8 0 01-5.5-2.6.2.2 0 01 0-.4l1.1-.9a.2.2 0 01.2 0 42 42 0 0035.7 0 .2.2 0 01.2 0l1.1.9a.2.2 0 010 .3 36.4 36.4 0 01-5.5 2.7.2.2 0 00-.1.3 47.2 47.2 0 003.6 5.9.2.2 0 00.2.1A58.6 58.6 0 0070.6 43a.2.2 0 000-.2 59.2 59.2 0 00-10.2-38c0 0-.1 0-.1-.1zM23.7 35.1c-3.3 0-6-3-6-6.7s2.7-6.7 6-6.7 6.1 3 6 6.7c0 3.7-2.7 6.7-6 6.7zm22.2 0c-3.3 0-6-3-6-6.7s2.6-6.7 6-6.7 6 3 6 6.7-2.7 6.7-6 6.7z" />
            </svg>
          </div>
          <div>
            <h2 className={styles.communityTitle}>Comunidade no Discord</h2>
            <p className={styles.communityDesc}>Conecte-se com outros membros e tire dúvidas.</p>
          </div>
        </div>
        <a href={info?.community?.link || "https://discord.gg/codigozero"}
          target="_blank" rel="noopener noreferrer" className={styles.communityBtn}>
          Entrar no Discord →
        </a>
      </div>

      {/* Mentoria */}
      <div className={styles.mentoriaCard}>
        <div className={styles.mentoriaHeader}>
          <span className={styles.mentoriaIcon}>🎙️</span>
          <div>
            <h2 className={styles.mentoriaTitle}>Próxima Mentoria ao Vivo</h2>
            <p className={styles.mentoriaDesc}>Sessão semanal com perguntas e respostas.</p>
          </div>
        </div>

        {info?.mentoria?.nextSession ? (
          <>
            <div className={styles.countdownGrid}>
              <div className={styles.countdownItem}>
                <span className={styles.countdownValue}>{pad(countdown.days)}</span>
                <span className={styles.countdownLabel}>Dias</span>
              </div>
              <span className={styles.countdownSep}>:</span>
              <div className={styles.countdownItem}>
                <span className={styles.countdownValue}>{pad(countdown.hours)}</span>
                <span className={styles.countdownLabel}>Horas</span>
              </div>
              <span className={styles.countdownSep}>:</span>
              <div className={styles.countdownItem}>
                <span className={styles.countdownValue}>{pad(countdown.mins)}</span>
                <span className={styles.countdownLabel}>Min</span>
              </div>
              <span className={styles.countdownSep}>:</span>
              <div className={styles.countdownItem}>
                <span className={styles.countdownValue}>{pad(countdown.secs)}</span>
                <span className={styles.countdownLabel}>Seg</span>
              </div>
            </div>
            {info.mentoria.link && (
              <a href={info.mentoria.link} target="_blank" rel="noopener noreferrer" className={styles.mentoriaBtn}>
                Acessar Mentoria →
              </a>
            )}
          </>
        ) : (
          <div className={styles.noMentoria}><p>Nenhuma mentoria agendada. Fique atento ao Discord!</p></div>
        )}
      </div>

      {/* Stats */}
      {info?.stats && (
        <div className={styles.statsCard}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{info.stats.currentUsers}</span>
            <span className={styles.statLabel}>Membros</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>{info.stats.maxUsers}</span>
            <span className={styles.statLabel}>Vagas</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statValue}>{info.stats.maxUsers - info.stats.currentUsers}</span>
            <span className={styles.statLabel}>Restantes</span>
          </div>
        </div>
      )}
    </div>
  );
}
