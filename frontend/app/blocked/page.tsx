"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Badge } from "@/components/ui";
import styles from "./blocked.module.css";

/* ═══════════════════════════════════════════════════
   Blocked — Assinatura Expirada / Cancelada
   Acionado quando a API retorna 403.
   ═══════════════════════════════════════════════════ */

interface BlockedReason {
  status: string;
  message: string;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const ArrowRight = (p: { size?: number }) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

export default function BlockedPage() {
  const router = useRouter();
  const [reason, setReason] = useState<BlockedReason | null>(null);
  // Affiliate commission is the user's own money, so the saque screen stays
  // open with an expired subscription (see affiliate.routes.ts). This page is
  // where an expired affiliate lands, so it must offer the way back in —
  // otherwise the balance is reachable only by typing the URL by hand.
  const [affiliateBalance, setAffiliateBalance] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("cz_token");
    if (!token) return;
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    // Raw fetch, not the api() helper: that one turns a 403 into a redirect
    // back to this very page.
    fetch(`${API}/api/affiliate/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.enrolled && (d.balance?.available ?? 0) > 0) {
          setAffiliateBalance(d.balance.available);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Defensive redirect: coproducers and admins should never see this
    // page. If they land here (stale cache, race with role flip, etc.),
    // bounce them to their proper dashboard instead of showing a
    // "renew subscription" CTA that doesn't apply.
    try {
      const cached = localStorage.getItem("cz_user");
      if (cached) {
        const u = JSON.parse(cached);
        if (u?.role === "coproducer") { router.replace("/coproducer"); return; }
        if (u?.role === "admin")      { router.replace("/admin"); return; }
      }
    } catch {}

    try {
      const stored = localStorage.getItem("cz_blocked_reason");
      if (stored) setReason(JSON.parse(stored));
    } catch {}
  }, [router]);

  const isOverdue = reason?.status === "overdue";
  const isCanceled = reason?.status === "canceled";

  const statusLabel = isOverdue
    ? "Assinatura vencida"
    : isCanceled
    ? "Assinatura cancelada"
    : "Acesso bloqueado";

  const defaultMessage = isOverdue
    ? "Sua assinatura expirou. Renove agora para continuar acessando todo o conteúdo da plataforma Código Zero."
    : isCanceled
    ? "Sua assinatura foi cancelada. Se isso foi um engano, fale com o suporte ou renove abaixo."
    : "Seu acesso à plataforma está temporariamente indisponível. Renove para continuar.";

  const handleLogout = () => {
    localStorage.removeItem("cz_token");
    localStorage.removeItem("cz_user");
    localStorage.removeItem("cz_blocked_reason");
    router.push("/login");
  };

  const handleRenew = async () => {
    try {
      const cached = localStorage.getItem("cz_user");
      if (cached) {
        const u = JSON.parse(cached);
        if (u.checkoutUrl) {
          window.open(u.checkoutUrl, "_blank", "noopener,noreferrer");
          return;
        }
      }
    } catch {}
    window.open("https://pay.lojou.app/codigozero", "_blank", "noopener,noreferrer");
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.icon}>
          <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        <div style={{ marginBottom: "var(--space-3)" }}>
          <Badge variant={isCanceled ? "error" : "warning"} size="md">
            {statusLabel}
          </Badge>
        </div>

        <h1 className={styles.title}>Acesso suspenso</h1>
        <p className={styles.message}>{reason?.message || defaultMessage}</p>

        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={handleRenew} iconEnd={<ArrowRight />}>
            Renovar assinatura
          </Button>
          <Button variant="secondary" size="lg" onClick={handleLogout}>
            Sair da conta
          </Button>
        </div>

        {affiliateBalance !== null && (
          <p className={styles.help}>
            Você tem{" "}
            <strong>
              {affiliateBalance.toLocaleString("pt-MZ", { maximumFractionDigits: 0 })} MT
            </strong>{" "}
            de comissão disponível.{" "}
            <a
              className={styles.helpLink}
              onClick={() => router.push("/afiliacao")}
              style={{ cursor: "pointer" }}
            >
              Solicitar saque
            </a>
          </p>
        )}

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
