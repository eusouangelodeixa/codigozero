"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./blocked.module.css";

/* ═══════════════════════════════════════════════════
   Blocked — Assinatura Expirada / Cancelada
   Redireciona aqui quando a API retorna 403
   ═══════════════════════════════════════════════════ */

interface BlockedReason {
  status: string;
  message: string;
}

export default function BlockedPage() {
  const router = useRouter();
  const [reason, setReason] = useState<BlockedReason | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cz_blocked_reason");
      if (stored) setReason(JSON.parse(stored));
    } catch {}
  }, []);

  const isOverdue = reason?.status === "overdue";
  const isCanceled = reason?.status === "canceled";

  const statusLabel = isOverdue
    ? "Assinatura Vencida"
    : isCanceled
    ? "Assinatura Cancelada"
    : "Acesso Bloqueado";

  const defaultMessage = isOverdue
    ? "Sua assinatura expirou. Renove agora para continuar acessando todo o conteúdo da plataforma Código Zero."
    : isCanceled
    ? "Sua assinatura foi cancelada. Se isso foi um erro, entre em contato com o suporte ou assine novamente."
    : "Seu acesso à plataforma está temporariamente indisponível. Renove sua assinatura para continuar.";

  const handleLogout = () => {
    localStorage.removeItem("cz_token");
    localStorage.removeItem("cz_user");
    localStorage.removeItem("cz_blocked_reason");
    router.push("/login");
  };

  const handleRenew = async () => {
    // Try to get user-specific checkout URL from stored data
    try {
      const cached = localStorage.getItem("cz_user");
      if (cached) {
        const u = JSON.parse(cached);
        if (u.checkoutUrl) {
          window.open(u.checkoutUrl, "_blank");
          return;
        }
      }
    } catch {}
    // Fallback to generic checkout
    window.open("https://pay.lojou.app/codigozero", "_blank");
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Icon */}
        <div className={styles.icon}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Status badge */}
        <span className={`${styles.statusBadge} ${
          isCanceled ? styles.statusCanceled : styles.statusOverdue
        }`}>
          {isOverdue ? "⚠️" : "✕"} {statusLabel}
        </span>

        {/* Title */}
        <h1 className={styles.title}>Acesso Suspenso</h1>

        {/* Message */}
        <p className={styles.message}>
          {reason?.message || defaultMessage}
        </p>

        {/* Actions */}
        <div className={styles.actions}>
          <button className={styles.renewBtn} onClick={handleRenew}>
            Renovar Assinatura
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </button>

          <button className={styles.logoutBtn} onClick={handleLogout}>
            Sair da conta
          </button>
        </div>

        {/* Help */}
        <p className={styles.help}>
          Precisa de ajuda?{" "}
          <a
            className={styles.helpLink}
            href="https://wa.me/16205260031"
            target="_blank"
            rel="noopener noreferrer"
          >
            Fale com o suporte
          </a>
        </p>

      </div>
    </div>
  );
}
