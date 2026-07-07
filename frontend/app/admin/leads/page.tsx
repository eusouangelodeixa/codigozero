"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import styles from "../admin.module.css";
import DateRangeFilter, { DateRange } from "@/components/admin/DateRangeFilter";
import { Modal, useToast } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

const STATUS_LABEL: Record<string, string> = {
  active: "Assinante",
  grace_period: "Carência",
  overdue: "Atrasado",
  canceled: "Cancelado",
  lead: "Lead",
};

const TX_STATUS_LABEL: Record<string, string> = {
  approved: "Aprovado",
  pending: "Pendente",
  failed: "Falhou",
  refunded: "Reembolsado",
};

function statusClass(status: string) {
  if (status === "active" || status === "approved") return styles.badgeGreen;
  if (status === "lead" || status === "grace_period" || status === "pending") return styles.badgeYellow;
  if (status === "overdue" || status === "canceled" || status === "failed" || status === "refunded") return styles.badgeRed;
  return styles.badgeGray;
}

export default function AdminLeads() {
  const toast = useToast();
  const [leads, setLeads] = useState<any[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [pages, setPages] = useState<{ slug: string; title: string }[]>([]);
  const [range, setRange] = useState<DateRange>({ period: "all" });
  const [total, setTotal] = useState(0);

  // Detail drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(() => {
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
    fetch(`${API}/api/admin/leads?${params}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => { setLeads(data.leads || []); setTotal(data.total || 0); })
      .catch(console.error);
  }, [filter, search, source, range]);

  useEffect(() => { load(); }, [load]);

  // Content pages (iscas) for the source filter dropdown.
  useEffect(() => {
    fetch(`${API}/api/admin/content-pages`, { headers: hdr() })
      .then((r) => r.json()).then((d) => setPages(d.pages || [])).catch(() => {});
  }, []);

  const [exporting, setExporting] = useState(false);

  // Export the current view as CSV. The route needs the Bearer token, so we
  // fetch with auth → blob → trigger a download instead of navigating to a raw
  // URL. Mirrors the on-screen filters by passing the same query params as load().
  const exportCsv = useCallback(async () => {
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
    setExporting(true);
    try {
      const res = await fetch(`${API}/api/admin/leads/export?${params}`, { headers: hdr() });
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
  }, [filter, search, source, range, toast]);

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

  const badge = (status: string) => (
    <span className={`${styles.badge} ${statusClass(status)}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );

  const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
  const fmtDateTime = (d?: string | null) =>
    d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const fmtMoney = (amount?: number | null, currency = "MZN") =>
    amount == null ? "—" : `${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  const lead = detail?.lead;
  const stats = detail?.stats;
  const txs: any[] = detail?.transactions || [];
  const waDigits = (lead?.phone || "").replace(/\D/g, "");

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Leads da Landing Page</h1>
        <p className={styles.pageDesc}>{total} registos encontrados</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableToolbar}>
          <input
            className={styles.tableSearch}
            placeholder="Buscar por nome, email ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {[
            { id: "all", label: "Todos" },
            { id: "subscriber", label: "Assinantes" },
            { id: "unpaid", label: "Leads" },
          ].map((f) => (
            <button
              key={f.id}
              className={`${styles.filterBtn} ${filter === f.id ? styles.filterBtnActive : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className={styles.tableToolbar}>
          <select
            className={styles.filterBtn}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            title="Filtrar por origem (LP dos Reels ou isca de conteúdo)"
          >
            <option value="all">Todas as origens</option>
            <option value="lp:reels">LP — Reels</option>
            {pages.map((p) => (
              <option key={p.slug} value={`content:${p.slug}`}>Isca: {p.title}</option>
            ))}
          </select>
          <DateRangeFilter value={range} onChange={setRange} />
          <button
            type="button"
            className={styles.filterBtn}
            style={{ marginLeft: "auto" }}
            onClick={exportCsv}
            disabled={exporting}
          >
            {exporting ? "Exportando…" : "Exportar CSV"}
          </button>
        </div>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Telefone</th>
              <th>Status</th>
              <th>Cadastro</th>
              <th>Expira</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={6} className={styles.empty}>Nenhum lead encontrado</td></tr>
            ) : leads.map((l) => (
              <tr key={l.id} className={styles.clickableRow} onClick={() => openLead(l.id)}>
                <td>{l.name}</td>
                <td>{l.email}</td>
                <td>{l.phone}</td>
                <td>{badge(l.subscriptionStatus)}</td>
                <td>{fmtDate(l.createdAt)}</td>
                <td>{fmtDate(l.subscriptionEnd)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={styles.mobileCards}>
          {leads.length === 0 ? (
            <div className={styles.empty}>Nenhum lead encontrado</div>
          ) : leads.map((l) => (
            <div key={l.id} className={`${styles.mCard} ${styles.clickableRow}`} onClick={() => openLead(l.id)}>
              <div className={styles.mCardHead}>
                <span className={styles.mCardName}>{l.name}</span>
                {badge(l.subscriptionStatus)}
              </div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Email</span><span className={styles.mCardValue}>{l.email}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Telefone</span><span className={styles.mCardValue}>{l.phone}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Cadastro</span><span className={styles.mCardValue}>{fmtDate(l.createdAt)}</span></div>
              <div className={styles.mCardRow}><span className={styles.mCardLabel}>Expira</span><span className={styles.mCardValue}>{fmtDate(l.subscriptionEnd)}</span></div>
            </div>
          ))}
        </div>
      </div>

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
              {badge(lead.subscriptionStatus)}
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
              <Field label="Status" value={STATUS_LABEL[lead.subscriptionStatus] || lead.subscriptionStatus} />
              <Field label="Início" value={fmtDate(lead.subscriptionStart)} />
              <Field label="Expira" value={fmtDate(lead.subscriptionEnd)} />
              <Field label="Pedido (Lojou)" value={lead.lojouOrderId || "—"} />
              <Field label="Acesso manual" value={lead.grantedManually ? "Sim" : "Não"} />
              <Field label="Close Friends" value={lead.closeFriends ? `Sim · até ${fmtDate(lead.closeFriendsUntil)}` : "Não"} />
              <Field label="Komunika" value={lead.komunikaCompanyId ? (lead.komunikaDeprovisionedAt ? "Suspenso" : "Ativo") : "—"} />
            </Section>

            {/* Attribution */}
            <Section title="Origem & atribuição">
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
                      <span className={`${styles.badge} ${statusClass(t.status)}`}>
                        {TX_STATUS_LABEL[t.status] || t.status}
                      </span>
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
