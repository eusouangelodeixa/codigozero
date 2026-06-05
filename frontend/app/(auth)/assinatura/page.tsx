"use client";
import { useEffect, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Modal,
  Badge,
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

type StatusKind = "active" | "warning" | "danger";

const STATUS_META: Record<string, { label: string; kind: StatusKind; badge: "success" | "warning" | "error" | "neutral" }> = {
  active:       { label: "Ativa",                 kind: "active",  badge: "success" },
  lead:         { label: "Aguardando pagamento",  kind: "warning", badge: "warning" },
  grace_period: { label: "Período de graça",      kind: "warning", badge: "warning" },
  overdue:      { label: "Atrasada",              kind: "danger",  badge: "error"   },
  canceled:     { label: "Cancelada",             kind: "danger",  badge: "error"   },
};

const CheckIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const XIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 20} height={p.size ?? 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const AlertIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const LockIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 22} height={p.size ?? 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const REASONS = [
  "Não estou usando a plataforma",
  "O preço não cabe no meu orçamento",
  "Não encontrei o que esperava",
  "Vou usar outra solução",
  "Problemas técnicos",
  "Outro motivo",
];

const INCLUDED = [
  "Aulas completas",
  "Scripts de prospecção",
  "Radar de leads",
  "Chat da comunidade",
  "Suporte com mentor",
  "Automações WhatsApp",
];

export default function AssinaturaPage() {
  const toast = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [price, setPrice] = useState<number | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState<1 | 2 | 3>(1);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [retentionOffer, setRetentionOffer] = useState<{ code: string; discount: string } | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(false);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => d.user && setUser(d.user));

    // Real subscription price (admin-configurable), so the page never shows a
    // stale hardcoded value.
    fetch(`${API}/api/landing/config`)
      .then((r) => r.json())
      .then((d) => setPrice(Number(d?.config?.priceAmount) || 497))
      .catch(() => setPrice(497));
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

  if (!user) return null;

  const meta = STATUS_META[user.subscriptionStatus] || { label: user.subscriptionStatus, kind: "warning" as StatusKind, badge: "neutral" as const };
  const isActive = user.subscriptionStatus === "active";
  const daysLeft = user.subscriptionEnd
    ? Math.ceil((new Date(user.subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const needsRenewal =
    ["grace_period", "overdue", "canceled"].includes(user.subscriptionStatus) ||
    (isActive && daysLeft !== null && daysLeft <= 3);

  const statusIconKind: StatusKind = meta.kind;
  const StatusIcon =
    statusIconKind === "active" ? CheckIcon : statusIconKind === "warning" ? AlertIcon : LockIcon;

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Assinatura"
        title="Sua assinatura"
        description="Status do plano, próxima renovação e o que está incluído."
      />

      {/* ── Status hero ── */}
      <div
        className={cx(
          styles.statusHero,
          meta.kind === "active" && styles.statusActive,
          meta.kind === "warning" && styles.statusWarning,
          meta.kind === "danger" && styles.statusDanger
        )}
      >
        <span
          className={cx(
            styles.statusIcon,
            meta.kind === "active" && styles.statusIconActive,
            meta.kind === "warning" && styles.statusIconWarning,
            meta.kind === "danger" && styles.statusIconDanger
          )}
        >
          <StatusIcon size={26} />
        </span>
        <Badge variant={meta.badge} size="md">{meta.label}</Badge>

        {isActive && daysLeft !== null && (
          <>
            <p className={styles.statusMessage}>
              {daysLeft > 3
                ? <>Sua assinatura renova em <strong>{daysLeft} dias</strong>.</>
                : daysLeft > 0
                ? <>Sua assinatura expira em <strong>{daysLeft} dia{daysLeft > 1 ? "s" : ""}</strong>.</>
                : <strong>Sua assinatura expirou hoje.</strong>}
            </p>
            <div className={styles.validityTrack} aria-hidden>
              <div
                className={styles.validityFill}
                style={{ width: `${Math.max(4, Math.min(100, (daysLeft / 30) * 100))}%` }}
              />
            </div>
          </>
        )}

        {!isActive && (
          <p className={styles.statusMessage}>
            {user.subscriptionStatus === "grace_period"
              ? "Você tem até 72h de acesso restante. Renove para não perder o conteúdo."
              : user.subscriptionStatus === "canceled"
              ? "Renove a qualquer momento para recuperar o acesso completo."
              : "Renove agora para voltar a acessar todas as aulas, scripts e o Radar."}
          </p>
        )}

        {needsRenewal && (
          <div className={styles.statusActions}>
            <Button
              variant="primary"
              size="lg"
              onClick={() => {
                const link = user.renewalUrl || user.checkoutUrl || "/";
                window.open(link, "_blank", "noopener,noreferrer");
              }}
            >
              Renovar assinatura
            </Button>
          </div>
        )}
      </div>

      {/* ── Plan details ── */}
      <Card padding="lg">
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Detalhes do plano</h2>
          <div className={styles.detailsGrid}>
            <div className={styles.detail}>
              <span className={styles.detailLabel}>Plano</span>
              <span className={styles.detailValue}>Código Zero — Mensal</span>
            </div>
            <div className={styles.detail}>
              <span className={styles.detailLabel}>Valor</span>
              <span className={cx(styles.detailValue, styles.detailValueAccent)}>
                {price != null ? `${price.toLocaleString("pt-BR")} MT / mês` : "—"}
              </span>
            </div>
            {user.createdAt && (
              <div className={styles.detail}>
                <span className={styles.detailLabel}>Membro desde</span>
                <span className={styles.detailValue}>
                  {new Date(user.createdAt).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
            {user.subscriptionEnd && (
              <div className={styles.detail}>
                <span className={styles.detailLabel}>
                  {isActive ? "Próxima renovação" : "Expirou em"}
                </span>
                <span className={styles.detailValue}>
                  {new Date(user.subscriptionEnd).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* ── Included ── */}
      <Card padding="lg">
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>O que está incluído</h2>
          <div className={styles.includedGrid}>
            {INCLUDED.map((item) => (
              <div
                key={item}
                className={cx(styles.includedRow, !isActive && styles.includedRowOff)}
              >
                <span>{item}</span>
                <span
                  className={cx(
                    styles.includedCheck,
                    isActive ? styles.includedCheckOn : styles.includedCheckOff
                  )}
                >
                  {isActive ? <CheckIcon size={11} /> : <XIcon size={11} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Danger zone ── */}
      {isActive && (
        <Card padding="lg" className={styles.dangerCard}>
          <div className={styles.section}>
            <div>
              <h2 className={cx(styles.sectionTitle, styles.dangerTitle)}>Zona de perigo</h2>
              <p className={styles.statusMessage} style={{ textAlign: "left", margin: 0 }}>
                Ao cancelar, você perde acesso imediato a todo o conteúdo da plataforma.
              </p>
            </div>
            <div>
              <Button variant="danger" onClick={() => setCancelOpen(true)}>
                Cancelar assinatura
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Cancel modal (3-step) ── */}
      <Modal
        open={cancelOpen}
        onClose={resetCancel}
        size="md"
        title={
          cancelStep === 1
            ? "Antes de ir, conta pra gente"
            : cancelStep === 2
            ? "Temos uma oferta especial"
            : "Confirmar cancelamento"
        }
        description={
          cancelStep === 1
            ? "Isso nos ajuda a melhorar. Opcional, mas valioso."
            : cancelStep === 2
            ? "Pode reconsiderar — só precisa do cupom abaixo."
            : "Esta ação é definitiva e libera sua vaga para outro membro."
        }
        footer={
          cancelStep === 1 ? (
            <>
              <Button variant="secondary" onClick={resetCancel}>Desistir</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const isPriceReason = cancelReason === "O preço não cabe no meu orçamento";
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
        {cancelStep === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
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
              label="Algo mais que queira compartilhar?"
              value={cancelFeedback}
              onChange={(e) => setCancelFeedback(e.target.value)}
              placeholder="Opcional"
            />
          </div>
        )}

        {cancelStep === 2 && (
          loadingOffer ? (
            <p style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--text-tertiary)" }}>
              Preparando oferta especial…
            </p>
          ) : retentionOffer ? (
            <div className={styles.offerCard}>
              <span className={styles.offerTitle}>Cupom exclusivo de retenção</span>
              <p style={{ fontSize: "var(--type-small)", color: "var(--text-secondary)" }}>
                Use na próxima renovação para ganhar <strong style={{ color: "var(--accent)" }}>{retentionOffer.discount} de desconto</strong>:
              </p>
              <div className={styles.offerCode}>{retentionOffer.code}</div>
              <span className={styles.offerHint}>Válido para 1 uso. Copie e cole no checkout.</span>
            </div>
          ) : (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--type-small)" }}>
              Sentimos muito que esteja indo. Se mudar de ideia, pode renovar a qualquer momento.
            </p>
          )
        )}

        {cancelStep === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <p style={{ fontSize: "var(--type-small)", color: "var(--text-secondary)" }}>
              Ao cancelar, você perde imediatamente o acesso a:
            </p>
            <ul className={styles.warningList}>
              <li>Todas as aulas e materiais</li>
              <li>Scripts de prospecção</li>
              <li>Radar de leads</li>
              <li>Chat da comunidade</li>
            </ul>
            <Input
              label="Senha"
              type="password"
              value={cancelPassword}
              onChange={(e) => setCancelPassword(e.target.value)}
              hint="Digite sua senha para confirmar."
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
