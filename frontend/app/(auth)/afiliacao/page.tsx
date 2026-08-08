"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  Card,
  Button,
  Input,
  Badge,
  EmptyState,
  Skeleton,
  Tabs,
  useToast,
  type BadgeProps,
  type TabItem,
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

/**
 * Espelho de AFFILIATE_RULES (backend/src/services/affiliate.service.ts).
 * TUDO nesta tela — preço, percentual, prazo, taxas — sai daqui.
 * Nunca escreva esses números à mão: o backend é a fonte da verdade.
 */
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

type HistoryTab = "indicacoes" | "saques";

/** Dinheiro com centavos — saldos, extratos, tabelas. */
const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** Dinheiro de vitrine (headline, taxas fixas) — sem centavos. */
const fmtInt = (v: number) => new Intl.NumberFormat("pt-MZ", { maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) =>
  `${new Intl.NumberFormat("pt-MZ", { maximumFractionDigits: 1 }).format(v * 100)}%`;

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const METHOD_LABEL: Record<string, string> = { mpesa: "M-Pesa", emola: "eMola" };

/** Qualquer status fora do mapa cai em "Pendente" — mesmo comportamento de antes. */
const WITHDRAWAL_STATUS: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  paid: { label: "Pago", variant: "success" },
  rejected: { label: "Rejeitado", variant: "error" },
  pending: { label: "Pendente", variant: "warning" },
};

const HISTORY_EMPTY: Record<HistoryTab, { title: string; description: string }> = {
  indicacoes: {
    title: "Ainda sem pagantes",
    description: "Assim que alguém assinar pelo seu link, aparece aqui com a data do pagamento.",
  },
  saques: {
    title: "Nenhum saque ainda",
    description: "Quando você solicitar um saque, o pedido e o status ficam registrados aqui.",
  },
};

const CopyIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const FolderIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const SparkIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24" />
  </svg>
);

/** Regras + taxas num lugar só. Aparece UMA vez por tela, no rodapé. */
function Fineprint({ rules }: { rules: Rules | null }) {
  return (
    <p className={styles.fineprint}>
      <strong>Regras do programa:</strong> não prometa enriquecimento — fale do ecossistema. Spam dá
      ban imediato.
      {rules && (
        <>
          {" "}
          De cada comissão a plataforma desconta {fmtPct(rules.platformPercent)} do valor da venda +{" "}
          {fmtInt(rules.platformFixed)} MT. O saque custa {fmtPct(rules.withdrawalPercent)} +{" "}
          {fmtInt(rules.withdrawalFixed)} MT, com mínimo de {fmtInt(rules.minWithdrawal)} MT, e a
          comissão só fica disponível em D+{rules.availableAfterDays} depois da venda aprovada.
        </>
      )}
    </p>
  );
}

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
  const [tab, setTab] = useState<HistoryTab>("indicacoes");

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

  // Comissão bruta e líquida por venda — 100% derivadas de `rules`.
  const grossCommissionPerSale = useMemo(() => {
    if (!rules) return 0;
    return rules.salePrice * rules.commissionRate;
  }, [rules]);

  const netCommissionPerSale = useMemo(() => {
    if (!rules) return 0;
    const fee = rules.salePrice * rules.platformPercent + rules.platformFixed;
    return Math.max(0, grossCommissionPerSale - fee);
  }, [rules, grossCommissionPerSale]);

  // Cotação ao vivo da taxa de saque.
  const withdrawQuote = useMemo(() => {
    if (!rules) return null;
    const amount = parseFloat(amountInput);
    if (!Number.isFinite(amount) || amount < rules.minWithdrawal) return null;
    const fee = amount * rules.withdrawalPercent + rules.withdrawalFixed;
    return { amount, fee, net: Math.max(0, amount - fee) };
  }, [amountInput, rules]);

  const available = balance?.available ?? 0;
  const minWithdrawal = rules?.minWithdrawal ?? 0;
  const canWithdraw = !!rules && available >= rules.minWithdrawal;
  const isHistoryEmpty = tab === "indicacoes" ? referrals.length === 0 : withdrawals.length === 0;

  const requestWithdrawal = async () => {
    const amount = parseFloat(amountInput);
    if (!rules) return;
    if (!Number.isFinite(amount) || amount < rules.minWithdrawal) {
      toast.error(`Saque mínimo: ${fmtInt(rules.minWithdrawal)} MT`);
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
          `Você receberá ${fmtMzn(data.amountNet)} MT (taxa ${fmtMzn(data.feeAmount)}).`,
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

  const creativesAction = creativesUrl ? (
    <a href={creativesUrl} target="_blank" rel="noopener noreferrer" className={styles.ghostLink}>
      <FolderIcon /> Pasta de criativos
    </a>
  ) : undefined;

  // ── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.page}>
        <PageHeader
          label="Conta · Afiliação"
          title="Programa de Afiliados"
          description="Carregando a sua conta…"
        />
        <div className={styles.hero}>
          {(["55%", "35%"] as const).map((w) => (
            <Card key={w} padding="lg">
              <div className={styles.skelStack}>
                <Skeleton variant="line" width={w} />
                <Skeleton variant="title" width="80%" />
                <Skeleton variant="line" width="65%" />
              </div>
            </Card>
          ))}
        </div>
        <Card padding="lg">
          <div className={styles.skelStack}>
            <Skeleton variant="line" width="100%" />
            <Skeleton variant="line" width="88%" />
          </div>
        </Card>
      </div>
    );
  }

  // ── Estado 1: não inscrito ────────────────────────────────────────────
  if (!enrolled) {
    return (
      <div className={styles.page}>
        <PageHeader
          label="Conta · Afiliação"
          title="Indique o Código Zero e ganhe todo mês"
          description={
            rules
              ? `Você fica com ${fmtPct(rules.commissionRate)} de cada mensalidade — e recebe de novo a cada renovação do aluno.`
              : "Você ganha uma fatia de cada mensalidade — e recebe de novo a cada renovação do aluno."
          }
          actions={creativesAction}
        />

        <Card padding="lg">
          <div className={styles.pitch}>
            <div className={styles.pitchMain}>
              <span className={styles.eyebrow}>Você recebe por venda</span>
              <div className={styles.pitchValue}>
                {rules ? fmtInt(Math.round(netCommissionPerSale)) : "—"}
                <span className={styles.currency}>MT</span>
              </div>
              <p className={styles.pitchLead}>
                {rules ? (
                  <>
                    Líquido, já com a taxa da plataforma descontada.{" "}
                    <strong>
                      {fmtPct(rules.commissionRate)} da mensalidade de {fmtInt(rules.salePrice)} MT
                    </strong>{" "}
                    ={" "}
                    {fmtMzn(grossCommissionPerSale)} MT brutos — e a comissão se repete a cada mês
                    que o aluno continuar assinando.
                  </>
                ) : (
                  <>
                    Comissão recorrente sobre cada mensalidade, enquanto o aluno indicado continuar
                    assinando.
                  </>
                )}
              </p>
              <div className={styles.pitchActions}>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={enroll}
                  loading={enrolling}
                  iconStart={<SparkIcon />}
                >
                  Gerar meu link de afiliado
                </Button>
              </div>
            </div>

            <ul className={styles.facts}>
              {[
                {
                  value: rules ? `D+${rules.availableAfterDays}` : "—",
                  label: "Prazo para o dinheiro ficar disponível depois da venda aprovada",
                },
                { value: "M-Pesa · eMola", label: "Você escolhe por onde recebe o saque" },
                {
                  value: rules ? `${fmtInt(rules.minWithdrawal)} MT` : "—",
                  label: "Saque mínimo por solicitação",
                },
              ].map((f) => (
                <li key={f.label} className={styles.fact}>
                  <span className={styles.factValue}>{f.value}</span>
                  <span className={styles.factLabel}>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Fineprint rules={rules} />
      </div>
    );
  }

  // ── Estado 2: inscrito ────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Afiliação"
        title="Programa de Afiliados"
        description="Seu saldo, seu link e as suas indicações num lugar só."
        actions={creativesAction}
      />

      {/* Herói: quanto tem para sacar + o link para copiar. */}
      <section className={styles.hero}>
        <Card padding="lg" className={styles.payoutCard}>
          <div className={styles.payoutInner}>
            <span className={styles.eyebrow}>Disponível para saque</span>
            <div className={styles.payoutValue}>
              {fmtMzn(available)}
              <span className={styles.currency}>MT</span>
            </div>
            <p className={styles.payoutHint}>
              {canWithdraw
                ? "Pode solicitar agora — cai na sua conta M-Pesa ou eMola."
                : rules
                  ? `Faltam ${fmtMzn(minWithdrawal - available)} MT para o mínimo de ${fmtInt(minWithdrawal)} MT.`
                  : "Saldo indisponível no momento."}
            </p>
            <div className={styles.payoutAction}>
              <Button
                variant="primary"
                fullWidth
                onClick={() => setShowWithdraw((v) => !v)}
                disabled={!canWithdraw}
              >
                {showWithdraw ? "Fechar" : "Solicitar saque"}
              </Button>
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <div className={styles.linkInner}>
            <span className={styles.eyebrow}>Seu link de afiliado</span>
            <div className={styles.linkBox}>
              <code className={styles.linkText}>{account?.link}</code>
              <Button size="sm" variant="secondary" iconStart={<CopyIcon />} onClick={copyLink}>
                Copiar
              </Button>
            </div>
            <div className={styles.linkMeta}>
              <span>
                Código <span className={styles.codeChip}>{account?.code}</span>
              </span>
              <span>·</span>
              <span>Compartilhe no story, no grupo ou no direct. Toda venda por ele é sua.</span>
            </div>
          </div>
        </Card>
      </section>

      {/* Formulário de saque — só aparece quando o afiliado pede. */}
      {showWithdraw && (
        <Card padding="lg">
          <div className={styles.withdrawInner}>
            <h2 className={styles.cardTitle}>Solicitar saque</h2>

            <div className={styles.formGrid}>
              <Input
                label="Valor a sacar (MT)"
                type="number"
                inputMode="decimal"
                min={rules?.minWithdrawal}
                step={1}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder={rules ? String(rules.minWithdrawal) : "0"}
                hint={`Disponível ${fmtMzn(available)} MT · mínimo ${fmtInt(minWithdrawal)} MT`}
              />
              <Input
                label="Número para recebimento"
                inputMode="tel"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="+258 84 123 4567"
                hint="Precisa ser uma conta no seu nome."
              />
            </div>

            <div className={styles.methodRow}>
              <span className={styles.fieldLabel} id="metodo-saque">
                Receber por
              </span>
              <div className={styles.segment} role="radiogroup" aria-labelledby="metodo-saque">
                {(["mpesa", "emola"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    className={`${styles.segmentItem} ${method === m ? styles.segmentActive : ""}`}
                    onClick={() => setMethod(m)}
                  >
                    {METHOD_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            {withdrawQuote && rules && (
              <dl className={styles.quote}>
                <div className={styles.quoteRow}>
                  <dt>Valor solicitado</dt>
                  <dd>{fmtMzn(withdrawQuote.amount)} MT</dd>
                </div>
                <div className={styles.quoteRow}>
                  <dt>
                    Taxa de saque ({fmtPct(rules.withdrawalPercent)} + {fmtInt(rules.withdrawalFixed)} MT)
                  </dt>
                  <dd>− {fmtMzn(withdrawQuote.fee)} MT</dd>
                </div>
                <div className={`${styles.quoteRow} ${styles.quoteTotal}`}>
                  <dt>Você recebe</dt>
                  <dd>{fmtMzn(withdrawQuote.net)} MT</dd>
                </div>
              </dl>
            )}

            <div className={styles.formActions}>
              <Button variant="primary" onClick={requestWithdrawal} loading={withdrawing}>
                Confirmar saque
              </Button>
              <Button variant="ghost" onClick={() => setShowWithdraw(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Números secundários — uma faixa só, não quatro cards. */}
      <Card padding="none">
        <div className={styles.statsRow}>
          {[
            {
              label: `Pendente${rules ? ` (D+${rules.availableAfterDays})` : ""}`,
              value: `${fmtMzn(balance?.pending ?? 0)} MT`,
              hint: "Libera depois do período de garantia.",
            },
            {
              label: "Já sacado",
              value: `${fmtMzn(balance?.withdrawn ?? 0)} MT`,
              hint: "Total pago via M-Pesa/eMola.",
            },
            {
              label: "Vendas confirmadas",
              value: String(balance?.paidLeadCount ?? 0),
              hint: `${fmtMzn(balance?.paidLeadEarnings ?? 0)} MT gerados desde o início.`,
            },
          ].map((s) => (
            <div key={s.label} className={styles.stat}>
              <span className={styles.eyebrow}>{s.label}</span>
              <span className={styles.statValue}>{s.value}</span>
              <span className={styles.statHint}>{s.hint}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Histórico — indicações e saques dividem o mesmo card. */}
      <Card padding="none" className={styles.tableCard}>
        <div className={styles.cardHead}>
          <h2 className={styles.cardTitle}>Histórico</h2>
          <Tabs
            items={
              [
                { value: "indicacoes", label: "Indicações", count: referrals.length },
                { value: "saques", label: "Saques", count: withdrawals.length },
              ] as TabItem<HistoryTab>[]
            }
            value={tab}
            onChange={setTab}
          />
        </div>

        {isHistoryEmpty ? (
          <div className={styles.emptyWrap}>
            <EmptyState compact icon={<SparkIcon size={20} />} {...HISTORY_EMPTY[tab]} />
          </div>
        ) : (
          <div className={styles.tableWrap}>
            {tab === "indicacoes" ? (
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
                      <td className={styles.name}>{r.leadName}</td>
                      <td>{fmtDate(r.paidAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th className={styles.num}>Valor</th>
                    <th className={styles.num}>Líquido</th>
                    <th>Método</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((w) => (
                    <tr key={w.id}>
                      <td>{fmtDate(w.createdAt)}</td>
                      <td className={styles.num}>{fmtMzn(w.amountRequested)} MT</td>
                      <td className={styles.num}>{fmtMzn(w.amountNet)} MT</td>
                      <td>{METHOD_LABEL[w.payoutMethod] ?? w.payoutMethod}</td>
                      <td>
                        <Badge size="sm" variant={WITHDRAWAL_STATUS[w.status]?.variant ?? "warning"}>
                          {WITHDRAWAL_STATUS[w.status]?.label ?? "Pendente"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      <Fineprint rules={rules} />
    </div>
  );
}
