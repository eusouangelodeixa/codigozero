"use client";
import { useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Modal,
  Badge,
  Skeleton,
  useToast,
} from "@/components/ui";
import styles from "./assinatura.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

interface User {
  subscriptionStatus: string;
  subscriptionEnd?: string;
  renewalUrl?: string;
  checkoutUrl?: string;
  createdAt?: string;
}

interface Payment {
  date: string;
  amount: number;
  currency: string;
  reference: string;
  gateway: string;
  isRenewal: boolean;
  paymentMethod: string | null;
  receiptUrl: string | null;
}

type StatusKind = "active" | "warning" | "danger";

interface StatusMeta {
  /** Rótulo curto do badge. */
  label: string;
  kind: StatusKind;
  badge: "success" | "warning" | "error" | "neutral";
  /** Resposta de 1 segundo — o que está acontecendo com a assinatura. */
  headline: string;
  /** Frase de apoio: o que isso significa na prática. */
  body: string;
  /** Rótulo do CTA de saída do estado (quando o estado exige ação). */
  cta?: string;
}

/**
 * Cada estado ganha sua própria voz: quem está em dia recebe confirmação, quem
 * está atrasado recebe um caminho (não um castigo). O `kind` só decide a cor —
 * o texto é que faz o trabalho.
 */
const STATUS_META: Record<string, StatusMeta> = {
  active: {
    label: "Ativa",
    kind: "active",
    badge: "success",
    headline: "Tudo em dia",
    body: "Teu acesso está liberado — aulas, scripts, Radar e disparador, tudo aberto.",
  },
  lead: {
    label: "Aguardando pagamento",
    kind: "warning",
    badge: "warning",
    headline: "Falta só o pagamento",
    body: "Assim que o pagamento cair, teu acesso abre na hora — sem espera e sem burocracia.",
    cta: "Concluir pagamento",
  },
  grace_period: {
    label: "Tempo extra",
    kind: "warning",
    badge: "warning",
    headline: "Estás no tempo extra",
    body: "Ainda dá para usar tudo por até 72h. Renova agora e nada se perde no caminho.",
    cta: "Renovar agora",
  },
  overdue: {
    label: "Pagamento em atraso",
    kind: "danger",
    badge: "error",
    headline: "O pagamento ainda não entrou",
    body: "Acontece. Renova em menos de um minuto e voltas exatamente de onde paraste.",
    cta: "Renovar assinatura",
  },
  canceled: {
    label: "Cancelada",
    kind: "danger",
    badge: "error",
    headline: "Assinatura cancelada",
    body: "Teu progresso continua guardado aqui. Quando quiseres voltar, é só reativar.",
    cta: "Reativar assinatura",
  },
};

const FALLBACK_META: StatusMeta = {
  label: "Estado desconhecido",
  kind: "warning",
  badge: "neutral",
  headline: "Não conseguimos ler o estado da tua assinatura",
  body: "Fala com o suporte que a gente resolve isso rapidinho.",
};

/* ── Ícones ────────────────────────────────────────────────── */

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const CheckIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} {...iconProps} strokeWidth={2.5}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const AlertIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} {...iconProps}>
    <path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const LockIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} {...iconProps}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const PlayIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <polygon points="10 8.5 16 12 10 15.5" fill="currentColor" stroke="none" />
  </svg>
);

const ScriptIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} {...iconProps}>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="15" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);

const RadarIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const SendIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} {...iconProps}>
    <line x1="21" y1="3" x2="10.5" y2="13.5" />
    <polygon points="21 3 14.5 21 10.5 13.5 3 9.5 21 3" />
  </svg>
);

const UsersIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} {...iconProps}>
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 00-3-3.87" />
  </svg>
);

const SupportIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} {...iconProps}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <line x1="14.5" y1="9.5" x2="18.4" y2="5.6" />
    <line x1="5.6" y1="18.4" x2="9.5" y2="14.5" />
    <line x1="14.5" y1="14.5" x2="18.4" y2="18.4" />
    <line x1="5.6" y1="5.6" x2="9.5" y2="9.5" />
  </svg>
);

const ExternalIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} {...iconProps}>
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

const ReceiptIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} {...iconProps}>
    <path d="M5 3v18l2.5-1.6L10 21l2-1.6L14 21l2.5-1.6L19 21V3z" />
    <line x1="8.5" y1="8.5" x2="15.5" y2="8.5" />
    <line x1="8.5" y1="12.5" x2="13" y2="12.5" />
  </svg>
);

const CopyIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} {...iconProps}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

/**
 * Anel de dias restantes. Preenche com a fração do ciclo de 30 dias que ainda
 * resta e muda de cor (verde → âmbar → vermelho) conforme a data aperta, com a
 * contagem no centro. Muito mais legível que uma linha "X dias".
 */
function DaysRing({ daysLeft }: { daysLeft: number }) {
  const total = 30;
  const remaining = Math.max(0, Math.min(total, daysLeft));
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = (remaining / total) * C;
  const color =
    daysLeft <= 3 ? "var(--color-error)" : daysLeft <= 7 ? "var(--color-warning)" : "var(--color-success)";
  return (
    <div className={styles.dial} style={{ color }}>
      <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={R} fill="none" stroke="var(--border-default)" strokeWidth="9" />
        <circle
          cx="64"
          cy="64"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
          transform="rotate(-90 64 64)"
          className={styles.dialArc}
        />
      </svg>
      <div className={styles.dialCenter}>
        <span className={styles.dialValue}>{Math.max(0, daysLeft)}</span>
        <span className={styles.dialLabel}>{daysLeft === 1 ? "dia restante" : "dias restantes"}</span>
      </div>
    </div>
  );
}

/** Mesma moldura do anel, para os estados que não têm contagem de dias. */
function StateDial({ kind }: { kind: StatusKind }) {
  const Icon = kind === "active" ? CheckIcon : kind === "warning" ? AlertIcon : LockIcon;
  return (
    <div
      className={cx(
        styles.dial,
        kind === "active" && styles.dialActive,
        kind === "warning" && styles.dialWarning,
        kind === "danger" && styles.dialDanger
      )}
    >
      <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r="52" fill="none" stroke="var(--border-default)" strokeWidth="9" />
        <circle
          cx="64"
          cy="64"
          r="52"
          fill="none"
          stroke="currentColor"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray="6 14"
          opacity="0.55"
        />
      </svg>
      <div className={styles.dialCenter}>
        <span className={styles.dialGlyph}>
          <Icon size={30} />
        </span>
      </div>
    </div>
  );
}

const REASONS = [
  "Não estou usando a plataforma",
  "O preço não cabe no meu orçamento",
  "Não encontrei o que esperava",
  "Vou usar outra solução",
  "Problemas técnicos",
  "Outro motivo",
];

const PRICE_REASON = "O preço não cabe no meu orçamento";

/** O que a assinatura entrega — benefício, não checklist. */
const INCLUDED: { icon: (p: { size?: number }) => React.JSX.Element; title: string; desc: string }[] = [
  { icon: PlayIcon, title: "Aulas completas", desc: "O método inteiro, do zero à primeira venda." },
  { icon: ScriptIcon, title: "Scripts de prospecção", desc: "Mensagens que já venderam — é copiar e adaptar." },
  { icon: RadarIcon, title: "Radar de leads", desc: "Empresas e contactos por nicho e cidade, em segundos." },
  { icon: SendIcon, title: "Disparador de WhatsApp", desc: "Fala com muita gente sem queimar teu número." },
  { icon: UsersIcon, title: "Comunidades", desc: "Gente fazendo o mesmo que tu, todo dia." },
  { icon: SupportIcon, title: "Suporte com mentor", desc: "Travou? Pergunta e destrava no mesmo dia." },
];

/** Como sair de um estado de atraso — três passos, tom de ajuda. */
const RENEW_STEPS = [
  { title: "Toca no botão de renovar", desc: "Abre a página de pagamento segura." },
  { title: "Paga como preferires", desc: "M-Pesa, e-Mola ou cartão — leva menos de um minuto." },
  { title: "Acesso volta na hora", desc: "Nada do teu progresso se perde no caminho." },
];

const METHOD_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  "m-pesa": "M-Pesa",
  emola: "e-Mola",
  "e-mola": "e-Mola",
  mkesh: "mKesh",
  card: "Cartão",
  credit_card: "Cartão",
  stripe: "Cartão",
};

const methodLabel = (m: string | null) =>
  m ? METHOD_LABEL[m.toLowerCase().replace(/\s+/g, "")] || METHOD_LABEL[m.toLowerCase()] || m : null;

const fmtShort = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const fmtLong = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

/**
 * Abre um link externo. Em navegador embutido (Instagram/WhatsApp) e no PWA
 * instalado, `window.open` pode devolver null e o clique "não faz nada" — por
 * isso o caminho do dinheiro (renovação) vai sempre na mesma aba, e os links
 * secundários caem para a mesma aba quando o popup é bloqueado.
 */
const openExternal = (url: string, sameTab = false) => {
  if (sameTab) {
    window.location.href = url;
    return;
  }
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) window.location.href = url;
};

const PAYMENTS_PREVIEW = 4;

export default function AssinaturaPage() {
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [showAllPayments, setShowAllPayments] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<1 | 2 | 3>(1);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [retentionOffer, setRetentionOffer] = useState<{ code: string; discount: string; message?: string } | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(false);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => d.user && setUser(d.user));

    // Preço real da assinatura (configurável no admin), para a página nunca
    // mostrar um valor hardcoded desatualizado.
    fetch(`${API}/api/landing/config`)
      .then((r) => r.json())
      .then((d) => setPrice(Number(d?.config?.priceAmount) || 297))
      .catch(() => setPrice(297));

    // Link nativo de gestão da assinatura no gateway (portal da Lojou). Só
    // aparece quando o cliente realmente tem um.
    fetch(`${API}/api/auth/subscription-portal`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (d?.url) setPortalUrl(d.url); })
      .catch(() => {});

    // Histórico de pagamentos (com link de recibo por pagamento).
    fetch(`${API}/api/auth/payment-history`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d?.payments)) setPayments(d.payments); })
      .catch(() => {});
  }, []);

  const resetCancel = () => {
    setCancelOpen(false);
    setCancelStep(1);
    setCancelPassword("");
    setCancelReason("");
    setCancelFeedback("");
    setRetentionOffer(null);
  };

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const res = await fetch(`${API}/api/auth/cancel-subscription`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          password: cancelPassword,
          reason: cancelReason || undefined,
          feedback: cancelFeedback || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Assinatura cancelada", "Você pode renovar a qualquer momento.");
        setUser((u) => (u ? { ...u, subscriptionStatus: "canceled" } : u));
        resetCancel();
      } else {
        toast.error("Falha ao cancelar", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setCanceling(false);
  };

  const copyCoupon = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Cupom copiado", "Cola no checkout para aplicar o desconto.");
    } catch {
      toast.error("Não deu para copiar", `Anota o código: ${code}`);
    }
  };

  const daysLeft = useMemo(() => {
    if (!user?.subscriptionEnd) return null;
    return Math.ceil((new Date(user.subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }, [user?.subscriptionEnd]);

  if (!user) {
    return (
      <div className={styles.page}>
        <PageHeader
          label="Conta · Assinatura"
          title="Sua assinatura"
          description="Estado do plano, próxima renovação e o que está incluído."
        />
        <Card padding="lg">
          <div className={styles.loading}>
            <Skeleton variant="avatar" width={128} height={128} />
            <div className={styles.loadingCopy}>
              <Skeleton variant="line" width="35%" />
              <Skeleton variant="title" width="70%" />
              <Skeleton variant="line" width="90%" />
              <Skeleton variant="line" width="60%" />
            </div>
          </div>
        </Card>
        <Card padding="lg">
          <Skeleton variant="block" height={140} />
        </Card>
      </div>
    );
  }

  const meta = STATUS_META[user.subscriptionStatus] || {
    ...FALLBACK_META,
    label: user.subscriptionStatus,
  };
  const isActive = user.subscriptionStatus === "active";
  const expiringSoon = isActive && daysLeft !== null && daysLeft <= 3;

  // Estado de atenção: quem não está ativo, ou quem está ativo mas a poucos
  // dias do fim do ciclo.
  const needsRenewal =
    ["lead", "grace_period", "overdue", "canceled"].includes(user.subscriptionStatus) || expiringSoon;

  const ctaLabel = meta.cta || (expiringSoon ? "Renovar agora" : null);

  // Headline do herói: quando a assinatura está ativa, a data manda.
  const headline = isActive
    ? daysLeft === null
      ? meta.headline
      : daysLeft > 3
      ? "Tudo em dia"
      : daysLeft > 0
      ? `Expira em ${daysLeft} dia${daysLeft > 1 ? "s" : ""}`
      : "Expira hoje"
    : meta.headline;

  const body = isActive
    ? daysLeft === null
      ? meta.body
      : daysLeft > 3
      ? user.subscriptionEnd
        ? `Renova automaticamente em ${fmtLong(user.subscriptionEnd)}. Não precisas fazer nada.`
        : meta.body
      : "Garante já a renovação para não perder o acesso nem o ritmo."
    : meta.body;

  const visiblePayments = showAllPayments ? payments : payments.slice(0, PAYMENTS_PREVIEW);

  const goRenew = () => openExternal(user.renewalUrl || user.checkoutUrl || "/", true);

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Assinatura"
        title="Sua assinatura"
        description="Estado do plano, próxima renovação e o que está incluído."
      />

      {/* ── Herói: estado, data e valor de uma vez só ── */}
      <section
        className={cx(
          styles.hero,
          meta.kind === "active" && styles.heroActive,
          meta.kind === "warning" && styles.heroWarning,
          meta.kind === "danger" && styles.heroDanger
        )}
      >
        <div className={styles.heroTop}>
          {isActive && daysLeft !== null ? <DaysRing daysLeft={daysLeft} /> : <StateDial kind={meta.kind} />}

          <div className={styles.heroCopy}>
            <Badge variant={meta.badge} size="md" dot pulse={meta.kind !== "active"}>
              {meta.label}
            </Badge>
            <h2 className={styles.heroHeadline}>{headline}</h2>
            <p className={styles.heroBody}>{body}</p>

            {needsRenewal && ctaLabel && (
              <div className={styles.heroActions}>
                <Button variant="primary" size="lg" onClick={goRenew}>
                  {ctaLabel}
                </Button>
                <span className={styles.heroActionsHint}>M-Pesa, e-Mola ou cartão</span>
              </div>
            )}
          </div>
        </div>

        {/* Fatos duros: plano, valor, datas. É o que responde em 1 segundo. */}
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Plano</dt>
            <dd className={styles.factValue}>Código Zero · Mensal</dd>
          </div>
          <div className={styles.fact}>
            <dt className={styles.factLabel}>Valor</dt>
            <dd className={cx(styles.factValue, styles.factValueAccent)}>
              {price != null ? (
                <>
                  {price.toLocaleString("pt-BR")} MT
                  <span className={styles.factSuffix}>/mês</span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          {user.subscriptionEnd && (
            <div className={styles.fact}>
              <dt className={styles.factLabel}>{isActive ? "Próxima renovação" : "Expirou em"}</dt>
              <dd className={styles.factValue}>{fmtShort(user.subscriptionEnd)}</dd>
            </div>
          )}
          {user.createdAt && (
            <div className={styles.fact}>
              <dt className={styles.factLabel}>Membro desde</dt>
              <dd className={styles.factValue}>{fmtShort(user.createdAt)}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* ── Caminho de volta: só quando o estado exige ação ── */}
      {!isActive && ctaLabel && (
        <Card padding="lg">
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Como voltar</span>
              <h2 className={styles.sectionTitle}>Três passos e está resolvido</h2>
            </div>
            <ol className={styles.steps}>
              {RENEW_STEPS.map((step, i) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
                  <div className={styles.stepCopy}>
                    <span className={styles.stepTitle}>{step.title}</span>
                    <span className={styles.stepDesc}>{step.desc}</span>
                  </div>
                </li>
              ))}
            </ol>
            <Button variant="primary" size="lg" fullWidth onClick={goRenew}>
              {ctaLabel}
            </Button>
          </div>
        </Card>
      )}

      {/* ── O que está incluído ── */}
      <Card padding="lg">
        <div className={styles.section}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionLabel}>O que entra no plano</span>
            <h2 className={styles.sectionTitle}>
              {isActive ? "Tudo isto está aberto para ti" : "Isto volta assim que renovares"}
            </h2>
          </div>
          <div className={styles.includedGrid}>
            {INCLUDED.map(({ icon: Icon, title, desc }) => (
              <div key={title} className={cx(styles.included, !isActive && styles.includedOff)}>
                <span className={styles.includedIcon}>
                  {isActive ? <Icon size={18} /> : <LockIcon size={16} />}
                </span>
                <div className={styles.includedCopy}>
                  <span className={styles.includedTitle}>{title}</span>
                  <span className={styles.includedDesc}>{desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Gerir assinatura (portal do gateway de pagamento) ── */}
      {portalUrl && (
        <Card padding="lg">
          <div className={styles.rowSection}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Gestão</span>
              <h2 className={styles.sectionTitle}>Gerir no gateway</h2>
              <p className={styles.sectionDesc}>
                Pausar, atualizar os teus dados ou rever recibos na página segura de pagamento.
              </p>
            </div>
            <Button
              variant="secondary"
              iconEnd={<ExternalIcon />}
              onClick={() => openExternal(portalUrl)}
            >
              Abrir gestão
            </Button>
          </div>
        </Card>
      )}

      {/* ── Histórico de pagamentos ── */}
      {payments.length > 0 && (
        <Card padding="lg">
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionLabel}>Histórico</span>
              <h2 className={styles.sectionTitle}>
                {payments.length} pagamento{payments.length > 1 ? "s" : ""} confirmado
                {payments.length > 1 ? "s" : ""}
              </h2>
            </div>

            <ul className={styles.payList}>
              {visiblePayments.map((p, i) => {
                const method = methodLabel(p.paymentMethod);
                return (
                  <li key={`${p.reference}-${i}`} className={styles.payItem}>
                    <div className={styles.payLine}>
                      <span className={styles.payDate}>{fmtShort(p.date)}</span>
                      <span className={styles.payAmount}>
                        {Number(p.amount).toLocaleString("pt-BR")} {p.currency}
                      </span>
                    </div>
                    <div className={styles.payLine}>
                      <span className={styles.payTags}>
                        <Badge variant={p.isRenewal ? "neutral" : "accent"} size="sm">
                          {p.isRenewal ? "Renovação" : "1ª assinatura"}
                        </Badge>
                        {method && <span className={styles.payMethod}>{method}</span>}
                        <span className={styles.payRef}>Ref. {p.reference}</span>
                      </span>
                      {p.receiptUrl && (
                        <button
                          type="button"
                          className={styles.payReceipt}
                          onClick={() => openExternal(p.receiptUrl!)}
                        >
                          <ReceiptIcon />
                          Recibo
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {payments.length > PAYMENTS_PREVIEW && (
              <button
                type="button"
                className={styles.payToggle}
                onClick={() => setShowAllPayments((v) => !v)}
              >
                {showAllPayments
                  ? "Mostrar menos"
                  : `Ver todos os ${payments.length} pagamentos`}
              </button>
            )}
          </div>
        </Card>
      )}

      {/* ── Cancelar: presente, mas discreto ── */}
      {isActive && (
        <div className={styles.quietZone}>
          <p className={styles.quietText}>
            Precisas cancelar? Dá para fazer aqui mesmo, sem burocracia.
          </p>
          <button type="button" className={styles.quietAction} onClick={() => setCancelOpen(true)}>
            Cancelar assinatura
          </button>
        </div>
      )}

      {/* ── Modal de cancelamento (3 passos) ── */}
      <Modal
        open={cancelOpen}
        onClose={resetCancel}
        size="md"
        title={
          cancelStep === 1
            ? "Antes de ires, conta pra gente"
            : cancelStep === 2
            ? "Temos uma proposta"
            : "Confirmar cancelamento"
        }
        description={
          cancelStep === 1
            ? "É opcional, mas ajuda muito a melhorar o produto."
            : cancelStep === 2
            ? "Se for só o preço, dá para resolver."
            : "Esta ação é definitiva e o acesso fecha na hora."
        }
        footer={
          cancelStep === 1 ? (
            <>
              <Button variant="secondary" onClick={resetCancel}>Desistir</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const isPriceReason = cancelReason === PRICE_REASON;
                  if (isPriceReason) {
                    setCancelStep(2);
                    setLoadingOffer(true);
                    try {
                      const res = await fetch(`${API}/api/auth/retention-offer`, {
                        method: "POST",
                        headers: hdr(),
                      });
                      const data = await res.json();
                      if (data.offer) setRetentionOffer(data.offer);
                    } catch {}
                    setLoadingOffer(false);
                  } else {
                    setCancelStep(3);
                  }
                }}
              >
                Continuar
              </Button>
            </>
          ) : cancelStep === 2 ? (
            <>
              <Button variant="accent" onClick={resetCancel}>Vou ficar!</Button>
              <Button variant="ghost" onClick={() => setCancelStep(3)}>Cancelar mesmo assim</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setCancelStep(2)}>Voltar</Button>
              <Button
                variant="danger"
                onClick={handleCancelSubscription}
                loading={canceling}
                disabled={!cancelPassword}
              >
                Confirmar cancelamento
              </Button>
            </>
          )
        }
      >
        <div className={styles.modalBody}>
          <div className={styles.stepTrack} aria-hidden>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={cx(styles.stepPip, n <= cancelStep && styles.stepPipOn)}
              />
            ))}
          </div>

          {cancelStep === 1 && (
            <>
              <div className={styles.reasonsList}>
                {REASONS.map((reason) => {
                  const active = cancelReason === reason;
                  return (
                    <button
                      type="button"
                      key={reason}
                      onClick={() => setCancelReason(reason)}
                      className={cx(styles.reasonItem, active && styles.reasonItemActive)}
                      aria-pressed={active}
                    >
                      <span className={styles.reasonRadio}>
                        {active && <span className={styles.reasonRadioDot} />}
                      </span>
                      {reason}
                    </button>
                  );
                })}
              </div>
              <Input
                label="Algo mais que queiras partilhar?"
                value={cancelFeedback}
                onChange={(e) => setCancelFeedback(e.target.value)}
                placeholder="Opcional"
              />
            </>
          )}

          {cancelStep === 2 &&
            (loadingOffer ? (
              <p className={styles.offerLoading}>A preparar uma proposta para ti…</p>
            ) : retentionOffer ? (
              <div className={styles.offerCard}>
                <span className={styles.offerLabel}>Cupom exclusivo de retenção</span>
                <p className={styles.offerText}>
                  Usa na próxima renovação e ganha{" "}
                  <strong className={styles.offerHighlight}>{retentionOffer.discount} de desconto</strong>.
                </p>
                <button
                  type="button"
                  className={styles.offerCode}
                  onClick={() => copyCoupon(retentionOffer.code)}
                  title="Copiar cupom"
                >
                  {retentionOffer.code}
                  <CopyIcon size={16} />
                </button>
                <span className={styles.offerHint}>
                  {retentionOffer.message || "Válido para 1 uso. Toca para copiar e cola no checkout."}
                </span>
              </div>
            ) : (
              <p className={styles.offerText}>
                Sentimos muito que estejas a ir. Se mudares de ideia, podes renovar quando quiseres.
              </p>
            ))}

          {cancelStep === 3 && (
            <>
              <p className={styles.offerText}>Ao cancelar, perdes imediatamente o acesso a:</p>
              <ul className={styles.warningList}>
                <li>Todas as aulas e materiais</li>
                <li>Scripts de prospecção</li>
                <li>Radar de leads e disparador</li>
                <li>Comunidades e suporte com mentor</li>
              </ul>
              <Input
                label="Senha"
                type="password"
                value={cancelPassword}
                onChange={(e) => setCancelPassword(e.target.value)}
                hint="Digita a tua senha para confirmar."
              />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
