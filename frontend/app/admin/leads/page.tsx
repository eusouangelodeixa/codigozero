"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import styles from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  SearchInput,
  RowActions,
  DateRangeFilter,
  type Column,
  type RowAction,
  type DateRange,
} from "@/components/admin";
import { Modal, useToast } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subscriptionStatus: string;
  subscriptionEnd?: string | null;
  lojouOrderId?: string | null;
  leadSource?: string | null;
  createdAt: string;
}
interface Metrics { totalLeads: number; subscribers: number; newToday: number; conversionRate: number }

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const fmtMoney = (amount?: number | null, currency = "MZN") =>
  amount == null ? "—" : `${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export default function AdminLeads() {
  const toast = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [pages, setPages] = useState<{ slug: string; title: string }[]>([]);
  const [range, setRange] = useState<DateRange>({ period: "all" });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  // Detail drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("filter", filter);
    if (search) params.set("search", search);
    if (source !== "all") params.set("source", source);
    if (range.period !== "all") {
      params.set("period", range.period);
      if (range.period === "custom") {
        if (range.from) params.set("from", range.from);
        if (range.to) params.set("to", range.to);
      }
    }
    return params;
  }, [filter, search, source, range]);

  const load = useCallback(() => {
    setLoading(true);
    const params = buildParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    fetch(`${API}/api/admin/leads?${params}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        setLeads(data.items || data.leads || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.metrics) setMetrics(data.metrics);
      })
      .catch(() => toast.error("Falha ao carregar leads"))
      .finally(() => setLoading(false));
  }, [buildParams, page, toast]);

  useEffect(() => { load(); }, [load]);

  // Content pages (iscas) for the source filter dropdown.
  useEffect(() => {
    fetch(`${API}/api/admin/content-pages`, { headers: hdr() })
      .then((r) => r.json()).then((d) => setPages(d.pages || [])).catch(() => {});
  }, []);

  // Setters de filtro que resetam a paginação para a página 1 (busca única).
  const onSearch = (v: string) => { setSearch(v); setPage(1); };
  const onFilter = (v: string) => { setFilter(v); setPage(1); };
  const onSource = (v: string) => { setSource(v); setPage(1); };
  const onRange = (r: DateRange) => { setRange(r); setPage(1); };

  const [exporting, setExporting] = useState(false);

  // Export the current view as CSV. The route needs the Bearer token, so we
  // fetch with auth → blob → trigger a download instead of navigating to a raw
  // URL. Mirrors the on-screen filters by passing the same query params as load().
  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/admin/leads/export?${buildParams()}`, { headers: hdr() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível exportar o CSV");
    } finally {
      setExporting(false);
    }
  }, [buildParams, toast]);

  const openLead = useCallback((id: string) => {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    fetch(`${API}/api/admin/leads/${id}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (d?.lead) setDetail(d);
        else toast.error("Não foi possível carregar o lead", d?.error);
      })
      .catch(() => toast.error("Erro de conexão"))
      .finally(() => setDetailLoading(false));
  }, [toast]);

  const closeLead = () => { setSelectedId(null); setDetail(null); };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
      .then(() => toast.success(`${label} copiado`))
      .catch(() => toast.error("Não foi possível copiar"));
  };

  // Rótulo amigável para a origem de captura (LP dos Reels ou isca de conteúdo).
  const sourceLabel = useCallback((src?: string | null) => {
    if (!src) return "—";
    if (src === "lp:reels") return "LP · Reels";
    if (src.startsWith("content:")) {
      const slug = src.slice("content:".length);
      const p = pages.find((pg) => pg.slug === slug);
      return `Isca · ${p?.title || slug}`;
    }
    return src;
  }, [pages]);

  const columns: Column<Lead>[] = [
    {
      key: "lead", header: "Lead", primaryOnMobile: true,
      render: (l) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{l.name}</span>
          <span className={k.cellSub}>{l.email}</span>
        </div>
      ),
    },
    { key: "phone", header: "Telefone", mono: true, render: (l) => l.phone || "—" },
    {
      key: "source", header: "Origem", hideOnMobile: true,
      render: (l) => <span className={k.cellMuted}>{sourceLabel(l.leadSource)}</span>,
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (l) => <StatusBadge kind="subscription" value={l.subscriptionStatus} />,
    },
    { key: "expira", header: "Expira", muted: true, render: (l) => fmtDate(l.subscriptionEnd) },
    { key: "criado", header: "Cadastro", muted: true, hideOnMobile: true, render: (l) => fmtDate(l.createdAt) },
  ];

  const rowActions = (l: Lead): ReactNode => {
    const digits = (l.phone || "").replace(/\D/g, "");
    const items: RowAction[] = [
      { label: "WhatsApp", onClick: () => window.open(`https://wa.me/${digits}`, "_blank", "noopener"), disabled: !digits },
      { label: "Copiar e-mail", onClick: () => copy(l.email, "Email") },
      { label: "Copiar telefone", onClick: () => copy(l.phone || "", "Telefone"), disabled: !l.phone },
    ];
    return <RowActions items={items} />;
  };

  const lead = detail?.lead;
  const stats = detail?.stats;
  const txs: any[] = detail?.transactions || [];
  const waDigits = (lead?.phone || "").replace(/\D/g, "");

  return (
    <>
      <AdminPage
        title="Leads"
        actions={
          <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={exportCsv} disabled={exporting}>
            {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
        }
        kpis={
          <StatRow>
            <StatTile accent label="Leads" loading={!metrics} value={metrics && fmt(metrics.totalLeads)} />
            <StatTile label="Assinantes" loading={!metrics} value={metrics && fmt(metrics.subscribers)} />
            <StatTile label="Novos hoje" loading={!metrics} value={metrics && fmt(metrics.newToday)} />
            <StatTile label="Conversão" loading={!metrics} value={metrics && `${metrics.conversionRate}%`} />
          </StatRow>
        }
      >
        <DataTable
          columns={columns}
          rows={leads}
          getRowKey={(l) => l.id}
          loading={loading}
          empty={{ title: "Nenhum lead encontrado", desc: "Ajuste a busca ou os filtros." }}
          rowActions={rowActions}
          onRowClick={(l) => openLead(l.id)}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
          toolbar={
            <>
              <SearchInput defaultValue={search} onSearch={onSearch} placeholder="Buscar por nome, e-mail ou telefone…" />
              <select className={k.select} value={filter} onChange={(e) => onFilter(e.target.value)} aria-label="Tipo">
                <option value="all">Todos</option>
                <option value="subscriber">Assinantes</option>
                <option value="unpaid">Leads</option>
              </select>
              <select className={k.select} value={source} onChange={(e) => onSource(e.target.value)} aria-label="Origem">
                <option value="all">Todas as origens</option>
                <option value="lp:reels">LP — Reels</option>
                {pages.map((p) => (
                  <option key={p.slug} value={`content:${p.slug}`}>Isca: {p.title}</option>
                ))}
              </select>
              <div className={k.toolbarSpacer} />
              <DateRangeFilter value={range} onChange={onRange} />
            </>
          }
        />
      </AdminPage>

      <Modal
        open={!!selectedId}
        onClose={closeLead}
        size="lg"
        title={lead ? lead.name : "Carregando…"}
        description={lead ? lead.email : undefined}
      >
        {detailLoading && !lead ? (
          <div className={styles.detailLoading}>Carregando detalhes…</div>
        ) : !lead ? (
          <div className={styles.detailLoading}>Não foi possível carregar o lead.</div>
        ) : (
          <div className={styles.detail}>
            {/* Status + quick actions */}
            <div className={styles.detailActions}>
              <StatusBadge kind="subscription" value={lead.subscriptionStatus} />
              {waDigits && (
                <a
                  className={`${styles.detailActionBtn} ${styles.detailActionPrimary}`}
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
              )}
              <button className={styles.detailActionBtn} onClick={() => copy(lead.email, "Email")}>Copiar email</button>
              <button className={styles.detailActionBtn} onClick={() => copy(lead.phone, "Telefone")}>Copiar telefone</button>
              {lead.checkoutUrl && (
                <button className={styles.detailActionBtn} onClick={() => copy(lead.checkoutUrl, "Link de checkout")}>Copiar checkout</button>
              )}
              {lead.renewalUrl && (
                <button className={styles.detailActionBtn} onClick={() => copy(lead.renewalUrl, "Link de renovação")}>Copiar renovação</button>
              )}
            </div>

            {/* Activity counters */}
            {stats && (
              <div className={styles.detailStats}>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{fmtMoney(stats.totalPaid)}</div>
                  <div className={styles.detailStatLabel}>Total pago</div>
                </div>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{stats.paymentsCount}</div>
                  <div className={styles.detailStatLabel}>Pagamentos</div>
                </div>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{stats.scrapedLeads}</div>
                  <div className={styles.detailStatLabel}>Leads gerados</div>
                </div>
                <div className={styles.detailStat}>
                  <div className={styles.detailStatValue}>{stats.lessonsCompleted}</div>
                  <div className={styles.detailStatLabel}>Aulas concluídas</div>
                </div>
              </div>
            )}

            {/* Subscription */}
            <Section title="Assinatura">
              <Field label="Status" value={<StatusBadge kind="subscription" value={lead.subscriptionStatus} />} />
              <Field label="Início" value={fmtDate(lead.subscriptionStart)} />
              <Field label="Expira" value={fmtDate(lead.subscriptionEnd)} />
              <Field label="Pedido (Lojou)" value={lead.lojouOrderId || "—"} />
              <Field label="Acesso manual" value={lead.grantedManually ? "Sim" : "Não"} />
              <Field label="Close Friends" value={lead.closeFriends ? `Sim · até ${fmtDate(lead.closeFriendsUntil)}` : "Não"} />
              <Field label="Komunika" value={lead.komunikaCompanyId ? (lead.komunikaDeprovisionedAt ? "Suspenso" : "Ativo") : "—"} />
            </Section>

            {/* Attribution */}
            <Section title="Origem & atribuição">
              <Field label="Origem de captura" value={sourceLabel(lead.leadSource)} />
              <Field label="Afiliado de origem" value={lead.referredByCode || "—"} />
              <Field label="Coprodutor de origem" value={lead.referredByCoproducer || "—"} />
              <Field label="É afiliado" value={lead.affiliateAccount?.code ? `Sim (${lead.affiliateAccount.code})` : "Não"} />
              <Field label="É coprodutor" value={lead.coproducerAccount?.code ? `Sim (${lead.coproducerAccount.code})` : "Não"} />
            </Section>

            {/* Activity / onboarding */}
            <Section title="Atividade">
              <Field label="Cadastro" value={fmtDateTime(lead.createdAt)} />
              <Field label="Primeiro acesso" value={fmtDateTime(lead.firstAccessAt)} />
              <Field label="Onboarding" value={lead.hasCompletedOnboarding ? "Concluído" : "Pendente"} />
              <Field label="Disparos enviados" value={String(stats?.dispatchesSent ?? 0)} />
              <Field label="Mensagens no chat" value={String(stats?.chatMessages ?? 0)} />
              <Field label="ID" value={lead.id} />
            </Section>

            {/* Payment history */}
            <Section title={`Histórico de pagamentos${txs.length ? ` (${txs.length})` : ""}`}>
              {txs.length === 0 ? (
                <div className={styles.detailEmpty}>Nenhuma transação registrada.</div>
              ) : (
                <div className={styles.txList}>
                  {txs.map((t) => (
                    <div key={t.id} className={styles.txRow}>
                      <div className={styles.txLeft}>
                        <span className={styles.txAmount}>{fmtMoney(t.amount, t.currency)}</span>
                        <span className={styles.txMeta}>
                          {fmtDateTime(t.createdAt)}
                          {t.isRenewal ? " · Renovação" : ""}
                          {t.paymentMethod ? ` · ${t.paymentMethod}` : ""}
                          {t.gateway ? ` · ${t.gateway}` : ""}
                        </span>
                      </div>
                      <StatusBadge kind="transaction" value={t.status} />
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </Modal>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.detailSection}>
      <h3 className={styles.detailSectionTitle}>{title}</h3>
      <div className={styles.detailGrid}>{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}
