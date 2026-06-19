"use client";
import { useEffect, useState } from "react";
import { PageHeader, useToast } from "@/components/ui";
import { Check, ExternalLink, Loader2, Plus } from "lucide-react";
import styles from "./ferramentas.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const KOMUNIKA_FEATURES = [
  "Funis de conversa",
  "Campanhas em massa",
  "Conversas e atendimento",
  "Contactos organizados",
];

// Provisional Komunika logo (indigo → violet gradient "K"), kept inline until a
// definitive asset is hosted at komunika.site/logo.svg. Palette matches the
// Komunika app's AI-node colors for visual continuity after the user clicks in.
function KomunikaLogo() {
  return (
    <svg viewBox="0 0 64 64" className={styles.logo} aria-label="Komunika">
      <defs>
        <linearGradient id="komunika-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#komunika-grad)" />
      <text
        x="32"
        y="45"
        fontFamily="-apple-system, system-ui, sans-serif"
        fontSize="40"
        fontWeight="900"
        fill="white"
        textAnchor="middle"
        letterSpacing="-2"
      >
        K
      </text>
    </svg>
  );
}

export default function FerramentasPage() {
  const toast = useToast();
  const [komunikaActive, setKomunikaActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}` });

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (d?.user) setKomunikaActive(!!d.user.komunikaActive); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Open the embedded Komunika via SSO. The backend mints a short-lived
  // magic-link; the JWT secret never reaches the browser.
  //
  // The hard part is opening it reliably from a MOBILE INSTALLED PWA (most of
  // our users). In standalone display-mode, window.open is unreliable: iOS
  // returns a "live" handle that silently ignores `win.location.href` (so the
  // user just stares at a blank tab that never navigates), and Android often
  // swallows the popup entirely. So branch on the context:
  //   • Standalone PWA → navigate the CURRENT context to the SSO url. Always
  //     works; the OS back gesture returns to the app.
  //   • Regular browser → pre-open a blank tab synchronously inside the click
  //     gesture (so the popup blocker allows it), then point it at the SSO url.
  const openKomunika = async () => {
    const standalone =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)").matches ||
        (window.navigator as { standalone?: boolean }).standalone === true);

    const win = standalone ? null : window.open("about:blank", "_blank");
    setOpening(true);
    try {
      const res = await fetch(`${API}/api/komunika/sso-link`, { headers: hdr() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        if (win && !win.closed) win.location.href = data.url;
        else window.location.href = data.url; // standalone PWA or popup blocked → same context
      } else {
        if (win && !win.closed) win.close();
        toast.error("Não foi possível abrir o Komunika", data.error);
      }
    } catch {
      if (win && !win.closed) win.close();
      toast.error("Erro de conexão");
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Ferramentas"
        title="Ferramentas"
        description="Seu hub de ferramentas e integrações. Abra direto, sem login extra."
      />

      <div className={styles.grid}>
        {/* ── Komunika ── */}
        <article className={styles.card}>
          <header className={styles.header}>
            <KomunikaLogo />
            <div className={styles.titleWrap}>
              <div className={styles.title}>Komunika</div>
              <div className={styles.subtitle}>Automação de WhatsApp</div>
            </div>
            <span className={komunikaActive ? styles.badge : `${styles.badge} ${styles.badgePending}`}>
              {loading ? "…" : komunikaActive ? "Incluído" : "Preparando"}
            </span>
          </header>

          <p className={styles.desc}>
            Plataforma de WhatsApp do Código Zero: centralize o atendimento, dispare campanhas e
            organize contactos e funis — tudo num só lugar, já incluído na sua assinatura.
          </p>

          <ul className={styles.features}>
            {KOMUNIKA_FEATURES.map((feat) => (
              <li key={feat} className={styles.feature}>
                <span className={styles.check}>
                  <Check size={11} strokeWidth={3} />
                </span>
                {feat}
              </li>
            ))}
          </ul>

          <footer className={styles.footer}>
            <span className={styles.limits}>1 número WhatsApp · 2 atendentes</span>
            <button
              type="button"
              className={styles.cta}
              onClick={openKomunika}
              disabled={loading || opening || !komunikaActive}
            >
              {opening ? (
                <>
                  <Loader2 size={16} className={styles.spin} />
                  Abrindo…
                </>
              ) : (
                <>
                  Abrir Komunika
                  <ExternalLink size={14} />
                </>
              )}
            </button>
          </footer>

          {!loading && !komunikaActive && (
            <span className={styles.note}>
              Seu acesso está sendo preparado — tente novamente em alguns minutos.
            </span>
          )}
        </article>

        {/* ── Future tools ── */}
        <div className={styles.placeholder}>
          <Plus size={20} strokeWidth={1.6} />
          <span>Mais ferramentas em breve</span>
        </div>
      </div>
    </div>
  );
}
