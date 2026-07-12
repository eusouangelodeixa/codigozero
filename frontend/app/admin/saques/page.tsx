"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  SegmentedControl,
  RowActions,
  type Column,
  type RowAction,
} from "@/components/admin";
import { useToast } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Party {
  code?: string; // affiliate only
  displayName?: string; // partner only
  user: { id: string; name: string; email: string; phone: string };
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
  processedBy: string | null;
  createdAt: string;
  affiliate?: Party;
  partner?: Party;
}

interface Metrics { pendingCount: number; pendingAmount: number }

type Source = "afiliados" | "socios";
type ActionKind = "approve" | "reject";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function AdminWithdrawalsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<Source>("afiliados");
  const [filter, setFilter] = useState("pending");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;

  // Modal de ação (approve/reject) com notas.
  const [action, setAction] = useState<{ w: Withdrawal; kind: ActionKind } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const basePath = source === "afiliados" ? "affiliate-withdrawals" : "partner-withdrawals";

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter !== "all") p.set("status", filter);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    fetch(`${API}/api/admin/${basePath}?${p}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        setRows(data.withdrawals || data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        setMetrics(data.metrics || null);
      })
      .catch(() => toast.error("Erro ao carregar saques"))
      .finally(() => setLoading(false));
  }, [basePath, filter, page, toast]);

  useEffect(() => { load(); }, [load]);

  // Setters de filtro que resetam a paginação para a página 1 (busca única).
  const onSource = (v: Source) => { setSource(v); setMetrics(null); setPage(1); };
  const onFilter = (v: string) => { setFilter(v); setPage(1); };

  const openAction = (w: Withdrawal, kind: ActionKind) => { setAction({ w, kind }); setNotes(""); };
  const closeAction = () => { if (!busy) setAction(null); };

  const submitAction = async () => {
    if (!action) return;
    const { w, kind } = action;
    setBusy(true);
    try {
      const res = await fetch(`${API}/api/admin/${basePath}/${w.id}/${kind}`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(kind === "approve" ? "Saque aprovado e pago" : "Saque rejeitado");
        setAction(null);
        load();
      } else {
        toast.error(`Falha ao ${kind === "approve" ? "aprovar" : "rejeitar"}`, data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setBusy(false);
    }
  };

  const partyOf = (w: Withdrawal) => (source === "afiliados" ? w.affiliate : w.partner);

  const columns: Column<Withdrawal>[] = [
    {
      key: "party", header: source === "afiliados" ? "Afiliado" : "Sócio", primaryOnMobile: true,
      render: (w) => {
        const party = partyOf(w);
        return (
          <div className={k.cellStack}>
            <span className={k.cellMain}>{party?.displayName || party?.user?.name || "—"}</span>
            <span className={k.cellSub}>
              {party?.code ? `${party.code} · ` : ""}{party?.user?.email}
            </span>
          </div>
        );
      },
    },
    {
      key: "valor", header: "Valor", mobileLabel: "Valor",
      render: (w) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{fmtMzn(w.amountNet)} MZN</span>
          <span className={k.cellSub}>Bruto {fmtMzn(w.amountRequested)} · Taxa {fmtMzn(w.feeAmount)}</span>
        </div>
      ),
    },
    {
      key: "metodo", header: "Método", mobileLabel: "Método",
      render: (w) => (
        <div className={k.cellStack}>
          <span>{w.payoutMethod === "mpesa" ? "M-Pesa" : "eMola"}</span>
          <span className={`${k.cellSub} ${k.cellMono}`}>{w.payoutTarget}</span>
        </div>
      ),
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (w) => (
        <div className={k.cellStack}>
          <span><StatusBadge kind="withdrawal" value={w.status} /></span>
          {w.notes && <span className={k.cellSub}>{w.notes}</span>}
          {w.status !== "pending" && w.processedAt && (
            <span className={k.cellSub}>Processado {fmtDateTime(w.processedAt)}</span>
          )}
        </div>
      ),
    },
    {
      key: "criado", header: "Solicitado", muted: true, hideOnMobile: true,
      render: (w) => fmtDateTime(w.createdAt),
    },
  ];

  const rowActions = (w: Withdrawal): ReactNode => {
    if (w.status !== "pending") return null;
    const items: RowAction[] = [
      { label: "Aprovar (pago)", onClick: () => openAction(w, "approve") },
      { label: "Rejeitar", onClick: () => openAction(w, "reject"), danger: true },
    ];
    return <RowActions items={items} />;
  };

  return (
    <>
      <AdminPage
        title="Saques"
        kpis={
          <StatRow>
            <StatTile
              accent
              label="Pendentes"
              loading={!metrics}
              value={metrics && fmt(metrics.pendingCount)}
              tone={metrics && metrics.pendingCount > 0 ? "warn" : undefined}
            />
            <StatTile
              label="Valor pendente"
              loading={!metrics}
              value={metrics && `${fmtMzn(metrics.pendingAmount)} MZN`}
            />
          </StatRow>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(w) => w.id}
          loading={loading}
          empty={{
            title: "Nenhum saque encontrado",
            desc: filter === "all" ? "Não há saques nesta aba." : "Ajuste o filtro de status.",
          }}
          rowActions={rowActions}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
          toolbar={
            <>
              <SegmentedControl<Source>
                value={source}
                onChange={onSource}
                options={[
                  { value: "afiliados", label: "Afiliados" },
                  { value: "socios", label: "Sócios" },
                ]}
              />
              <div className={k.toolbarSpacer} />
              <SegmentedControl
                value={filter}
                onChange={onFilter}
                options={[
                  { value: "pending", label: "Pendentes" },
                  { value: "paid", label: "Pagos" },
                  { value: "rejected", label: "Rejeitados" },
                  { value: "all", label: "Todos" },
                ]}
              />
            </>
          }
        />
      </AdminPage>

      {action && (
        <div className={a.modalOverlay} onClick={closeAction}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>{action.kind === "approve" ? "Aprovar saque" : "Rejeitar saque"}</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>
              {action.kind === "approve"
                ? "Confirme só depois de já ter pago via M-Pesa/eMola. Marca o saque como pago."
                : "Devolve o saldo ao afiliado/sócio para uma nova solicitação."}
              {" · "}
              <strong>{partyOf(action.w)?.displayName || partyOf(action.w)?.user?.name}</strong>
              {" · "}Líquido {fmtMzn(action.w.amountNet)} MZN
            </p>
            <div className={a.formGrid}>
              <div className={`${a.formGroup} ${a.formGroupFull}`}>
                <label className={a.formLabel}>
                  {action.kind === "approve" ? "Notas (opcional, ex.: nº de transação M-Pesa)" : "Motivo da rejeição (opcional)"}
                </label>
                <textarea
                  className={a.formTextarea}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={action.kind === "approve" ? "Nº de transação, canal…" : "Explique o motivo…"}
                  autoFocus
                />
              </div>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={submitAction} disabled={busy}>
                {busy
                  ? "Processando…"
                  : action.kind === "approve"
                    ? "Aprovar e marcar pago"
                    : "Rejeitar e devolver saldo"}
              </button>
              <button className={a.btnSecondary} onClick={closeAction} disabled={busy}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
