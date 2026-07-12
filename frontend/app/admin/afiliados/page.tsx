"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  SearchInput,
  RowActions,
  type Column,
  type RowAction,
} from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface AffiliateRow {
  id: string;
  code: string;
  enabled: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string; phone: string };
  payoutMethod: string | null;
  payoutTarget: string | null;
  stats: {
    paidReferrals: number;
    lostReferrals: number;
    pendingCommission: number;
    availableCommission: number;
    withdrawnCommission: number;
    totalPaidOut: number;
  };
}

const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtMzn = (v: number) =>
  new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
const payoutLabel = (method: string | null, target: string | null) =>
  method ? `${method === "mpesa" ? "M-Pesa" : "eMola"} ${target ?? ""}`.trim() : "—";

export default function AdminAffiliatesPage() {
  const [rows, setRows] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("search", search); // forward-compat: backend ignora hoje (ver resumo)
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    fetch(`${API}/api/admin/affiliates?${p}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        setRows(data.affiliates || data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch(() => showToast("Erro ao carregar afiliados"))
      .finally(() => setLoading(false));
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  // Reset de paginação ao mudar a busca (página 1).
  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  const toggle = async (r: AffiliateRow) => {
    const enabled = !r.enabled;
    try {
      const res = await fetch(`${API}/api/admin/affiliates/${r.id}`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) {
        showToast(enabled ? "Afiliado ativado" : "Afiliado desativado");
        load();
      } else {
        showToast("Falha ao atualizar");
      }
    } catch {
      showToast("Erro de conexão");
    }
  };

  // Busca do backend ainda não implementada neste endpoint (só page/pageSize):
  // fallback client-side sobre a página carregada para não regredir o filtro.
  const q = search.trim().toLowerCase();
  const visibleRows = q
    ? rows.filter(
        (r) =>
          r.code.toLowerCase().includes(q) ||
          r.user?.name?.toLowerCase().includes(q) ||
          r.user?.email?.toLowerCase().includes(q),
      )
    : rows;

  // KPIs financeiros somam a página carregada (endpoint sem metrics globais); o
  // total de afiliados vem do count global da paginação.
  const summary = rows.reduce(
    (acc, r) => {
      acc.vendas += r.stats.paidReferrals;
      acc.pending += r.stats.pendingCommission;
      acc.available += r.stats.availableCommission;
      return acc;
    },
    { vendas: 0, pending: 0, available: 0 },
  );

  const columns: Column<AffiliateRow>[] = [
    {
      key: "afiliado", header: "Afiliado", primaryOnMobile: true,
      render: (r) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{r.user?.name}</span>
          <span className={k.cellSub}>{r.user?.email}</span>
        </div>
      ),
    },
    { key: "code", header: "Código", mono: true, mobileLabel: "Código" },
    {
      key: "vendas", header: "Vendas", mobileLabel: "Vendas",
      render: (r) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{fmtInt(r.stats.paidReferrals)}</span>
          {r.stats.lostReferrals > 0 && (
            <span className={k.cellSub}>{r.stats.lostReferrals} reembolso/remarket</span>
          )}
        </div>
      ),
    },
    {
      key: "comissao", header: "Comissão", mobileLabel: "Comissão",
      render: (r) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{fmtMzn(r.stats.availableCommission)} MT</span>
          <span className={k.cellSub}>
            pend. {fmtMzn(r.stats.pendingCommission)} · pago {fmtMzn(r.stats.totalPaidOut)}
          </span>
        </div>
      ),
    },
    {
      key: "pagamento", header: "Pagamento", muted: true, hideOnMobile: true,
      render: (r) => payoutLabel(r.payoutMethod, r.payoutTarget),
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (r) => (
        <StatusBadge tone={r.enabled ? "good" : "neutral"} noDot>
          {r.enabled ? "Ativo" : "Desativado"}
        </StatusBadge>
      ),
    },
    { key: "desde", header: "Desde", muted: true, hideOnMobile: true, render: (r) => fmtDate(r.createdAt) },
  ];

  const rowActions = (r: AffiliateRow): ReactNode => {
    const items: RowAction[] = [
      { label: r.enabled ? "Desativar" : "Ativar", onClick: () => toggle(r), danger: r.enabled },
    ];
    return <RowActions items={items} />;
  };

  return (
    <>
      <AdminPage
        title="Afiliados"
        kpis={
          <StatRow>
            <StatTile accent label="Afiliados" loading={loading && rows.length === 0} value={fmtInt(total)} />
            <StatTile label="Vendas confirmadas" loading={loading && rows.length === 0} value={fmtInt(summary.vendas)} />
            <StatTile label="A liberar (D+7)" loading={loading && rows.length === 0} value={`${fmtMzn(summary.pending)} MT`} />
            <StatTile label="Saldo a pagar" loading={loading && rows.length === 0} value={`${fmtMzn(summary.available)} MT`} />
          </StatRow>
        }
      >
        <DataTable
          columns={columns}
          rows={visibleRows}
          getRowKey={(r) => r.id}
          loading={loading}
          empty={{ title: "Nenhum afiliado encontrado", desc: "Ajuste a busca." }}
          rowActions={rowActions}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
          toolbar={
            <>
              <SearchInput defaultValue={search} onSearch={onSearch} placeholder="Buscar por código, nome ou e-mail…" />
              <div className={k.toolbarSpacer} />
            </>
          }
        />
      </AdminPage>

      {toast && <div className={a.toast}>{toast}</div>}
    </>
  );
}
