"use client";

/* ═══════════════════════════════════════════════════════════
   Offline Fallback
   Precached by the service worker (public/sw.js) and served
   for navigation requests that fail with no cached copy — so
   the installed PWA shows a branded screen instead of a blank
   "no internet" page. Must work fully offline.
   ═══════════════════════════════════════════════════════════ */

import { Button } from "@/components/ui";
import { Logo } from "@/components/Logo";
import styles from "../fallback.module.css";

export default function OfflinePage() {
  const handleRetry = () => {
    // Reloading re-issues the navigation; if the connection is back the SW
    // serves the live page, otherwise we land here again.
    if (typeof window !== "undefined") window.location.reload();
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <Logo size={26} />
        </div>

        <div className={`${styles.icon} ${styles.iconOffline}`}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h1 className={styles.title}>Você está offline</h1>
        <p className={styles.message}>
          Não conseguimos conectar à internet. Verifique sua conexão e tente
          novamente — seu conteúdo aparece assim que você voltar a ficar online.
        </p>

        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={handleRetry}>
            Tentar novamente
          </Button>
        </div>
      </div>
    </div>
  );
}
