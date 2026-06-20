"use client";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, Card, Button, Input, Badge, EmptyState, useToast } from "@/components/ui";
import styles from "../(auth)/afiliacao/afiliacao.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Account {
  id: string;
  displayName: string;
  roleLabel: string | null;
  sharePct: number;
  payoutMethod: string | null;
  payoutTarget: string | null;
}

interface Balance {
  available: number;
  grossAvailable?: number;
  costShare?: number;
  pending: number;
  withdrawn: number;
  salesCount: number;
  lifetimeEarnings: number;
}

interface Rules {
  withdrawalPercent: number;
  withdrawalFixed: number;
  minWithdrawal: number;
  availableAfterDays: number;
}

interface Commission {
  id: string;
  orderId: string;
  baseAmount: number;
  sharePct: number;
  amount: number;
  status: string;
  availableAt: string;
  createdAt: string;
}

interface Withdrawal {
  id: string;
  amountRequested: number;
  feeAmount: number;
  amountNet: number;
  payoutMethod: string;
  status: string;
  processedAt: string | null;
  createdAt: string;
}

const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const statusLabel = (s: string) =>
  s === "available" ? "Disponível" : s === "pending" ? "Em espera (D+3)" : s === "withdrawn" ? "Sacado" : s === "refunded" ? "Estornado" : s;

const statusVariant = (s: string): "success" | "warning" | "error" | "neutral" =>
  s === "available" ? "success" : s === "pending" ? "warning" : s === "refunded" ? "error" : "neutral";

export default function SociosPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<Account | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  // Offboarded partner: only the balance + saque form, no ledger/history.
  const [withdrawOnly, setWithdrawOnly] = useState(false);

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
      const me = await fetch(`${API}/api/partner/me`, { headers: hdr() }).then((r) => r.json());
      setAccount(me.account);
      setBalance(me.balance);
      setRules(me.rules);
      setMethod(me.account?.payoutMethod || "mpesa");
      setTarget(me.account?.payoutTarget || "");
      const isWithdrawOnly = !!me.withdrawOnly;
      setWithdrawOnly(isWithdrawOnly);
      // Offboarded partners don't see the ledger/history, so skip those fetches.
      if (!isWithdrawOnly) {
        const [c, w] = await Promise.all([
          fetch(`${API}/api/partner/commissions`, { headers: hdr() }).then((r) => r.json()),
          fetch(`${API}/api/partner/withdrawals`, { headers: hdr() }).then((r) => r.json()),
        ]);
        setCommissions(c.commissions || []);
        setWithdrawals(w.withdrawals || []);
      }
    } catch {
      toast.error("Erro ao carregar painel de sócio");
    }
    setLoading(false);
  }, [hdr, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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
      const res = await fetch(`${API}/api/partner/withdrawals`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ amount, payoutMethod: method, payoutTarget: target.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Saque solicitado", `Você receberá ${fmtMzn(data.amountNet)} MZN (taxa ${fmtMzn(data.feeAmount)}).`);
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
        <PageHeader label="Conta · Sócios" title="Rateio de Receita" description="Carregando…" />
      </div>
    );
  }

  const minW = rules?.minWithdrawal ?? 1000;
  const canWithdraw = (balance?.available ?? 0) >= minW;

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Sócios"
        title="Rateio de Receita"
        description={
          account
            ? `Sua participação: ${account.sharePct}%${account.roleLabel ? ` · ${account.roleLabel}` : ""}`
            : "Acompanhe sua parte das vendas em tempo real."
        }
      />

      {/* ── Balance ── */}
      <div className={styles.statsGrid}>
        <Card padding="md">
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Disponível para saque</span>
            <span className={styles.statValueAccent}>{fmtMzn(balance?.available ?? 0)} MT</span>
            {balance?.costShare ? (
              <span className={styles.statHint}>
                Já descontado {fmtMzn(balance.costShare)} MT de custos rateados
              </span>
            ) : (
              <span className={styles.statHint}>
                {canWithdraw ? "Você pode solicitar agora" : `Mínimo: ${fmtMzn(minW)} MT`}
              </span>
            )}
          </div>
        </Card>
        <Card padding="md">
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Em espera (D+{rules?.availableAfterDays ?? 3})</span>
            <span className={styles.statValue}>{fmtMzn(balance?.pending ?? 0)} MT</span>
            <span className={styles.statHint}>Libera após o período de garantia</span>
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
            <span className={styles.statLabel}>Total ganho</span>
            <span className={styles.statValue}>{fmtMzn(balance?.lifetimeEarnings ?? 0)} MT</span>
            <span className={styles.statHint}>{balance?.salesCount ?? 0} venda(s)</span>
          </div>
        </Card>
      </div>

      <div className={styles.withdrawCta}>
        <Button variant="primary" onClick={() => setShowWithdraw((v) => !v)} disabled={!canWithdraw}>
          {showWithdraw ? "Fechar saque" : "Solicitar saque"}
        </Button>
        {!canWithdraw && (
          <span className={styles.fineprint}>Saldo abaixo do mínimo de {fmtMzn(minW)} MT.</span>
        )}
      </div>

      {/* ── Withdrawal form ── */}
      {showWithdraw && (
        <Card padding="lg">
          <div className={styles.withdrawForm}>
            <h3 className={styles.sectionTitle}>Solicitar saque</h3>
            <p className={styles.fineprint}>
              Taxa: {rules ? `${(rules.withdrawalPercent * 100).toFixed(0)}% + ${rules.withdrawalFixed} MT` : "—"} por saque · mínimo {fmtMzn(minW)} MT.
            </p>
            <div className={styles.formRow}>
              <Input
                label={`Valor a sacar (MT) · disponível ${fmtMzn(balance?.available ?? 0)}`}
                type="number"
                min={minW}
                step={1}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder={String(minW)}
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

            {amountInput && rules && parseFloat(amountInput) >= minW && (
              <div className={styles.quote}>
                <span>
                  Você receberá{" "}
                  <strong>
                    {fmtMzn(
                      Math.max(
                        0,
                        parseFloat(amountInput) - (parseFloat(amountInput) * rules.withdrawalPercent + rules.withdrawalFixed),
                      ),
                    )}{" "}
                    MT
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

      {/* ── Commissions ledger (real-time) ── */}
      {!withdrawOnly && (
      <Card padding="lg">
        <h3 className={styles.sectionTitle}>Comissões ({commissions.length})</h3>
        {commissions.length === 0 ? (
          <EmptyState compact title="Ainda sem comissões" description="Cada venda do produto principal aparece aqui com a sua parte." />
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Pedido</th>
                <th>Base</th>
                <th>%</th>
                <th>Sua parte</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id}>
                  <td>{fmtDate(c.createdAt)}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{c.orderId}</td>
                  <td>{fmtMzn(c.baseAmount)}</td>
                  <td>{c.sharePct}%</td>
                  <td style={{ color: "var(--accent)", fontWeight: 600 }}>{fmtMzn(c.amount)}</td>
                  <td>
                    <Badge size="sm" variant={statusVariant(c.status)}>
                      {statusLabel(c.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      )}

      {/* ── Withdrawal history ── */}
      {!withdrawOnly && withdrawals.length > 0 && (
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
                      variant={w.status === "paid" ? "success" : w.status === "rejected" ? "error" : "warning"}
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
    </div>
  );
}
