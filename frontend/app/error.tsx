"use client";

/* ═══════════════════════════════════════════════════════════
   Route Error Boundary
   Renders when an unexpected runtime error is thrown while
   rendering a route segment (page/layout below the root).
   The root layout still renders around this. For errors in
   the root layout itself, see app/global-error.tsx.
   ═══════════════════════════════════════════════════════════ */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { Logo } from "@/components/Logo";
import styles from "./fallback.module.css";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Surface the error in the console / any error reporting hook.
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.logo}>
          <Logo size={26} />
        </div>

        <div className={`${styles.icon} ${styles.iconError}`}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <h1 className={styles.title}>Algo deu errado</h1>
        <p className={styles.message}>
          Encontramos um problema inesperado ao carregar esta página. Você pode
          tentar novamente ou voltar para o início.
        </p>

        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={() => reset()}>
            Tentar novamente
          </Button>
          <Button variant="secondary" size="lg" onClick={() => router.push("/")}>
            Voltar ao início
          </Button>
        </div>

        {error?.digest && (
          <p className={styles.digest}>Código do erro: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
