"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Badge,
  EmptyState,
  useToast,
} from "@/components/ui";
import styles from "./afiliacao.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface AffiliateAccount {
  id: string;
  code: string;
  enabled: boolean;
  payoutMethod: string | null;
  payoutTarget: string | null;
  link: string;
  createdAt: string;
}

interface Balance {
  available: number;
  pending: number;
  withdrawn: number;
  paidLeadCount: number;
  paidLeadEarnings: number;
}

interface Rules {
  salePrice: number;
  commissionRate: number;
  platformPercent: number;
  platformFixed: number;
  withdrawalPercent: number;
  withdrawalFixed: number;
  minWithdrawal: number;
  availableAfterDays: number;
}

interface Withdrawal {
  id: string;
  amountRequested: number;
  feeAmount: number;
  amountNet: number;
  payoutMethod: string;
  payoutTarget: string;
  status: string;
  notes: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface ReferralRow {
  id: string;
  paidAt: string | null;
  leadName: string;
}

const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const CopyIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const FolderIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const SparkIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24" />
  </svg>
);

export default function AfiliacaoPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [account, setAccount] = useState<AffiliateAccount | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [creativesUrl, setCreativesUrl] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  // Withdrawal form
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [method, setMethod] = useState<"mpesa" | "emola">("mpesa");
  const [target, setTarget] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const hdr = useCallback(
    () => ({
      Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
      "Content-Type": "application/json",
    }),
    [],
  );

  const loadAll = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/affiliate/me`, { headers: hdr() });
      const data = await res.json();
      setRules(data.rules ?? null);
      setCreativesUrl(data.creativesUrl ?? null);
      if (data.enrolled) {
        setEnrolled(true);
        setAccount(data.account);
        setBalance(data.balance);
        setMethod(data.account.payoutMethod || "mpesa");
        setTarget(data.account.payoutTarget || "");
        const [w, r] = await Promise.all([
          fetch(`${API}/api/affiliate/withdrawals`, { headers: hdr() }).then((r) => r.json()),
          fetch(`${API}/api/affiliate/referrals`, { headers: hdr() }).then((r) => r.json()),
        ]);
        setWithdrawals(w.withdrawals || []);
        setReferrals(r.referrals || []);
      } else {
        setEnrolled(false);
      }
    } catch {
      toast.error("Erro ao carregar conta de afiliado");
    }
    setLoading(false);
  }, [hdr, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const enroll = async () => {
    setEnrolling(true);
    try {
      const res = await fetch(`${API}/api/affiliate/enroll`, {
        method: "POST",
        headers: hdr(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Link de afiliado gerado");
        await loadAll();
      } else {
        toast.error("Falha ao gerar link", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setEnrolling(false);
  };

  const copyLink = async () => {
    if (!account?.link) return;
    try {
      await navigator.clipboard.writeText(account.link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const grossCommissionPerSale = useMemo(() => {
    if (!rules) return 0;
    return rules.salePrice * rules.commissionRate;
  }, [rules]);

  const netCommissionPerSale = useMemo(() => {
    if (!rules) return 0;
    const fee = rules.salePrice * rules.platformPercent + rules.platformFixed;
    return Math.max(0, grossCommissionPerSale - fee);
  }, [rules, grossCommissionPerSale]);

  const requestWithdrawal = async () => {
    const amount = parseFloat(amountInput);
    if (!rules) return;
    if (!Number.isFinite(amount) || amount < rules.minWithdrawal) {
      toast.error(`Saque mínimo: ${rules.minWithdrawal} MZN`);
      return;
    }
    if (!target.trim()) {
      toast.error("Informe o número para receber");
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch(`${API}/api/affiliate/withdrawals`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({
          amount,
          payoutMethod: method,
          payoutTarget: target.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          "Saque solicitado",
          `Você receberá ${fmtMzn(data.amountNet)} MZN (taxa ${fmtMzn(data.feeAmount)}).`,
        );
        setShowWithdraw(false);
        setAmountInput("");
        await loadAll();
      } else {
        toast.error("Falha na solicitação", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setWithdrawing(false);
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader label="Conta · Afiliação" title="Programa de Afiliados" description="Carregando…" />
      </div>
    );
  }

  // ── Not enrolled state ────────────────────────────────────────────────
  const netRounded = Math.round(netCommissionPerSale);
  const dynamicDesc = rules
    ? `Indique e ganhe até ${netRounded} MT líquidos por venda recorrente. Apenas para alunos ativos.`
    : "Indique e ganhe por cada venda recorrente. Apenas para alunos ativos.";
  if (!enrolled) {
    return (
      <div className={styles.page}>
        <PageHeader
          label="Conta · Afiliação"
          title="Programa de Afiliados Código Zero"
          description={dynamicDesc}
        />

        <Card padding="lg">
          <div className={styles.heroBlock}>
            <h2 className={styles.heroTitle}>Como funciona</h2>
            <ul className={styles.bullets}>
              <li>
                <strong>Sua comissão:</strong>{" "}
                {rules ? (
                  <>
                    {Math.round(rules.commissionRate * 100)}% de cada mensalidade de {fmtMzn(rules.salePrice)} MT
                    · <em>≈ {fmtMzn(netCommissionPerSale)} MZN líquido por venda</em>
                  </>
                ) : (
                  <>uma fatia de cada venda recorrente</>
                )}
              </li>
              <li><strong>Receba via:</strong> M-Pesa ou eMola</li>
              <li><strong>Prazo:</strong> Saque disponível em D+7 após venda aprovada</li>
              <li><strong>Material:</strong> Seu link + criativos prontos</li>
            </ul>
            <div className={styles.heroActions}>
              <Button variant="primary" onClick={enroll} loading={enrolling} iconStart={<SparkIcon />}>
                Gerar meu link de afiliado
              </Button>
              {creativesUrl && (
                <a
                  href={creativesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.secondaryLink}
                >
                  <FolderIcon /> Acessar pasta de criativos
                </a>
              )}
            </div>
            <p className={styles.fineprint}>
              Regras: Não prometa enriquecimento. Fale do ecossistema. Spam = ban imediato.
              {rules && (
                <> Taxa da plataforma de {(rules.platformPercent * 100).toFixed(0)}% + {rules.platformFixed} MT é descontada da comissão.</>
              )}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ── Enrolled state ────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Afiliação"
        title="Programa de Afiliados Código Zero"
        description={dynamicDesc}
      />

      {/* ── Link card ── */}
      <Card padding="lg">
        <div className={styles.linkCardInner}>
          <div className={styles.linkLeft}>
            <span className={styles.linkLabel}>Seu link de afiliado</span>
            <div className={styles.linkBox}>
              <code className={styles.linkText}>{account?.link}</code>
              <Button size="sm" variant="secondary" iconStart={<CopyIcon />} onClick={copyLink}>
                Copiar
              </Button>
            </div>
            <span className={styles.codeLine}>
              Código: <strong>{account?.code}</strong>
            </span>
          </div>
          {creativesUrl && (
            <a
              href={creativesUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.creativesLink}
            >
              <FolderIcon size={16} /> Pasta de criativos
            </a>
          )}
        </div>
      </Card>

      {/* ── Balance ── */}
      <div className={styles.statsGrid}>
        <Card padding="md">
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Disponível para saque</span>
            <span className={styles.statValueAccent}>{fmtMzn(balance?.available ?? 0)} MT</span>
            <span className={styles.statHint}>
              {(balance?.available ?? 0) >= (rules?.minWithdrawal ?? 1000)
                ? "Você pode solicitar agora"
                : `Mínimo: ${fmtMzn(rules?.minWithdrawal ?? 1000)} MT`}
            </span>
          </div>
        </Card>
        <Card padding="md">
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Pendente (D+7)</span>
            <span className={styles.statValue}>{fmtMzn(balance?.pending ?? 0)} MT</span>
            <span className={styles.statHint}>Será liberado após o período de garantia</span>
          </div>
        </Card>
        <Card padding="md">
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Já sacado</span>
            <span className={styles.statValue}>{fmtMzn(balance?.withdrawn ?? 0)} MT</span>
            <span className={styles.statHint}>Total histórico</span>
          </div>
        </Card>
        <Card padding="md">
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Vendas confirmadas</span>
            <span className={styles.statValue}>{balance?.paidLeadCount ?? 0}</span>
            <span className={styles.statHint}>Pagantes que vieram pelo seu link</span>
          </div>
        </Card>
      </div>

      <div className={styles.withdrawCta}>
        <Button
          variant="primary"
          onClick={() => setShowWithdraw((v) => !v)}
          disabled={(balance?.available ?? 0) < (rules?.minWithdrawal ?? 1000)}
        >
          {showWithdraw ? "Fechar saque" : "Solicitar saque"}
        </Button>
        {(balance?.available ?? 0) < (rules?.minWithdrawal ?? 1000) && (
          <span className={styles.fineprint}>
            Saldo abaixo do mínimo de {fmtMzn(rules?.minWithdrawal ?? 1000)} MT.
          </span>
        )}
      </div>

      {/* ── Withdrawal form ── */}
      {showWithdraw && (
        <Card padding="lg">
          <div className={styles.withdrawForm}>
            <h3 className={styles.sectionTitle}>Solicitar saque</h3>
            <p className={styles.fineprint}>
              Taxa: {rules ? `${(rules.withdrawalPercent * 100).toFixed(0)}% + ${rules.withdrawalFixed} MT` : "—"} por saque ·
              mínimo {fmtMzn(rules?.minWithdrawal ?? 1000)} MT.
            </p>
            <div className={styles.formRow}>
              <Input
                label={`Valor a sacar (MT) · disponível ${fmtMzn(balance?.available ?? 0)}`}
                type="number"
                min={rules?.minWithdrawal ?? 1000}
                step={1}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder={String(rules?.minWithdrawal ?? 1000)}
              />
              <div>
                <span className={styles.label}>Método</span>
                <div className={styles.segment}>
                  <button
                    type="button"
                    className={`${styles.segmentItem} ${method === "mpesa" ? styles.segmentActive : ""}`}
                    onClick={() => setMethod("mpesa")}
                  >
                    M-Pesa
                  </button>
                  <button
                    type="button"
                    className={`${styles.segmentItem} ${method === "emola" ? styles.segmentActive : ""}`}
                    onClick={() => setMethod("emola")}
                  >
                    eMola
                  </button>
                </div>
              </div>
              <Input
                label="Número para recebimento"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="+258 84 123 4567"
              />
            </div>

            {amountInput && rules && parseFloat(amountInput) >= rules.minWithdrawal && (
              <div className={styles.quote}>
                <span>
                  Você receberá <strong>
                    {fmtMzn(
                      Math.max(
                        0,
                        parseFloat(amountInput) -
                          (parseFloat(amountInput) * rules.withdrawalPercent + rules.withdrawalFixed),
                      ),
                    )} MT
                  </strong>
                  <span style={{ marginLeft: 8, color: "var(--text-tertiary)" }}>
                    (taxa {fmtMzn(parseFloat(amountInput) * rules.withdrawalPercent + rules.withdrawalFixed)})
                  </span>
                </span>
              </div>
            )}

            <div>
              <Button variant="primary" onClick={requestWithdrawal} loading={withdrawing}>
                Confirmar saque
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Withdrawal history ── */}
      {withdrawals.length > 0 && (
        <Card padding="lg">
          <h3 className={styles.sectionTitle}>Histórico de saques</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Valor</th>
                <th>Líquido</th>
                <th>Método</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{fmtDate(w.createdAt)}</td>
                  <td>{fmtMzn(w.amountRequested)} MT</td>
                  <td>{fmtMzn(w.amountNet)} MT</td>
                  <td>{w.payoutMethod === "mpesa" ? "M-Pesa" : "eMola"}</td>
                  <td>
                    <Badge
                      size="sm"
                      variant={
                        w.status === "paid"
                          ? "success"
                          : w.status === "rejected"
                          ? "error"
                          : "warning"
                      }
                    >
                      {w.status === "paid" ? "Pago" : w.status === "rejected" ? "Rejeitado" : "Pendente"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* ── Referrals (paid only) ── */}
      <Card padding="lg">
        <h3 className={styles.sectionTitle}>Indicações pagantes ({referrals.length})</h3>
        {referrals.length === 0 ? (
          <EmptyState
            compact
            icon={<SparkIcon size={20} />}
            title="Ainda sem pagantes"
            description="Quando alguém pelo seu link concluir a assinatura, aparece aqui."
          />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td>{r.leadName}</td>
                  <td>{fmtDate(r.paidAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className={styles.fineprint}>
        Regras: Não prometa enriquecimento. Fale do ecossistema. Spam = ban imediato.
        {rules && (
          <> Taxa da plataforma de {(rules.platformPercent * 100).toFixed(0)}% + {rules.platformFixed} MT é descontada da comissão.</>
        )}
      </p>
    </div>
  );
}
