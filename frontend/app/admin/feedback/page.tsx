"use client";
/**
 * /admin/feedback — dashboard de KPIs da pesquisa de satisfação pós-compra
 * (sondagens WhatsApp D+14 + sugestões D+21 + formulário web /pesquisa).
 *
 * Abas: Visão geral (CSAT, funil, distribuição por pergunta, tendência) |
 * Sugestões (inbox lida/não lida) | Respostas (feed recente).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AdminPage,
  StatRow,
  StatTile,
  MetricCard,
  DataTable,
  StatusBadge,
  SegmentedControl,
  Section,
  type Column,
} from "@/components/admin";
import { useToast } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

// Rampa 1→4 (Abaixo do esperado → Excelente) sobre os tokens do tema.
const SCORE_COLORS = ["#EF4444", "#F59E0B", "#34D399", "#2DD4BF"];

type Period = "7d" | "30d" | "12m";

interface Overview {
  options: string[];
  funnel: { enrolled: number; sent: number; started: number; completed: number; responseRate: number | null };
  csatPct: number | null;
  avgScore: number | null;
  totalAnswered: number;
  perQuestion: {
    key: string;
    label: string;
    text: string;
    count: number;
    avgScore: number | null;
    csatPct: number | null;
    distribution: Record<number, number>;
  }[];
  trend: { bucket: string; responses: number; avgScore: number | null }[];
  channelSplit: {
    surveys: Record<string, number>;
    responses: { whatsapp: number; web: number };
  };
  suggestions: { inWindow: number; unread: number };
}

interface SuggestionRow {
  id: string;
  content: string;
  channel: string;
  isRead: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string; phone?: string };
}

interface ResponseRow {
  id: string;
  questionKey: string;
  questionLabel: string;
  optionText: string | null;
  score: number | null;
  channel: string;
  answeredAt: string;
  user: { id: string; name: string; email: string };
}

const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("pt-MZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function AdminFeedback() {
  const toast = useToast();
  const [period, setPeriod] = useState<Period>("30d");
  const [tab, setTab] = useState<"overview" | "suggestions" | "responses">("overview");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/admin/feedback?period=${period}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d as Overview);
      })
      .catch(() => toast.error("Falha ao carregar métricas de feedback"))
      .finally(() => setLoading(false));
  }, [period, toast]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const skeleton = loading && !data;

  return (
    <AdminPage
      eyebrow="Operação"
      title="Feedback"
      desc="Pesquisa de satisfação pós-compra: sondagens no WhatsApp (D+14), sugestões (D+21) e formulário web."
      actions={
        <SegmentedControl<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { value: "7d", label: "7d" },
            { value: "30d", label: "30d" },
            { value: "12m", label: "12m" },
          ]}
        />
      }
      kpis={
        <StatRow>
          <MetricCard
            accent
            label="CSAT"
            value={data?.csatPct != null ? `${data.csatPct}%` : "—"}
            sub="respostas Bom + Excelente"
            loading={skeleton}
            sparkline={data?.trend?.length ? data.trend.map((t) => ({ value: t.responses })) : undefined}
          />
          <MetricCard
            label="Taxa de resposta"
            value={data?.funnel?.responseRate != null ? `${data.funnel.responseRate}%` : "—"}
            sub={`${data?.funnel?.completed ?? 0} de ${data?.funnel?.sent ?? 0} pesquisas concluídas`}
            loading={skeleton}
          />
          <MetricCard
            label="Nota média"
            value={data?.avgScore != null ? `${data.avgScore}` : "—"}
            suffix="/ 4"
            sub={`${data?.totalAnswered ?? 0} respostas no período`}
            loading={skeleton}
          />
          <MetricCard
            label="Sugestões não lidas"
            value={data?.suggestions?.unread ?? "—"}
            sub={`${data?.suggestions?.inWindow ?? 0} recebidas no período`}
            loading={skeleton}
          />
        </StatRow>
      }
    >
      <div style={{ margin: "4px 0 16px" }}>
        <SegmentedControl<"overview" | "suggestions" | "responses">
          value={tab}
          onChange={setTab}
          options={[
            { value: "overview", label: "Visão geral" },
            { value: "suggestions", label: `Sugestões${data?.suggestions?.unread ? ` (${data.suggestions.unread})` : ""}` },
            { value: "responses", label: "Respostas" },
          ]}
        />
      </div>

      {tab === "overview" && <OverviewTab data={data} loading={skeleton} />}
      {tab === "suggestions" && <SuggestionsTab onChanged={loadOverview} />}
      {tab === "responses" && <ResponsesTab />}
    </AdminPage>
  );
}

// ── Visão geral ────────────────────────────────────────────────────────────

function OverviewTab({ data, loading }: { data: Overview | null; loading: boolean }) {
  const funnel = data?.funnel;
  const wa = data?.channelSplit?.surveys?.whatsapp ?? 0;
  const em = data?.channelSplit?.surveys?.email ?? 0;

  return (
    <>
      <Section title="Funil do período" collapsible={false}>
        <StatRow>
          <StatTile label="Inscritos" value={funnel?.enrolled ?? "—"} hint="entraram na fila" loading={loading} />
          <StatTile label="Enviadas" value={funnel?.sent ?? "—"} hint="chegaram ao cliente" loading={loading} />
          <StatTile label="Iniciadas" value={funnel?.started ?? "—"} hint="≥ 1 resposta" loading={loading} />
          <StatTile accent label="Concluídas" value={funnel?.completed ?? "—"} tone="good" loading={loading} />
          <StatTile
            label="Canal"
            value={`${wa} / ${em}`}
            hint="WhatsApp / E-mail"
            loading={loading}
          />
        </StatRow>
      </Section>

      <Section title="Distribuição por pergunta" subtitle="Escala: Abaixo do esperado → Excelente" collapsible={false}>
        {!data?.perQuestion?.length ? (
          <p style={{ color: "var(--text-tertiary)", fontSize: 13.5, margin: 0 }}>
            {loading ? "Carregando…" : "Sem respostas no período selecionado."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {data.perQuestion.map((q) => (
              <DistributionBar key={q.key} q={q} options={data.options} />
            ))}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 2 }}>
              {data.options.map((opt, i) => (
                <span key={opt} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: SCORE_COLORS[i], display: "inline-block" }} />
                  {opt}
                </span>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="Tendência" subtitle="Respostas recebidas e nota média por período" collapsible={false}>
        <TrendChart trend={data?.trend || []} loading={loading} />
      </Section>
    </>
  );
}

function DistributionBar({
  q,
  options,
}: {
  q: Overview["perQuestion"][number];
  options: string[];
}) {
  const total = q.count || 0;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 7 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>{q.label}</span>
        <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
          {total} resp. · média <b style={{ color: "var(--text-secondary)" }}>{q.avgScore ?? "—"}</b>
          {q.csatPct != null && (
            <>
              {" "}· CSAT <b style={{ color: "var(--accent)" }}>{q.csatPct}%</b>
            </>
          )}
        </span>
      </div>
      <div style={{ display: "flex", height: 22, borderRadius: 7, overflow: "hidden", background: "rgba(255,255,255,0.05)" }}>
        {total === 0 ? null : (
          [1, 2, 3, 4].map((score) => {
            const n = q.distribution?.[score] || 0;
            if (!n) return null;
            return (
              <div
                key={score}
                title={`${options[score - 1]}: ${n}`}
                style={{
                  width: `${(n / total) * 100}%`,
                  background: SCORE_COLORS[score - 1],
                  opacity: 0.85,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#001412",
                  minWidth: 18,
                }}
              >
                {n}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function TrendChart({ trend, loading }: { trend: Overview["trend"]; loading: boolean }) {
  const empty = !loading && (!trend.length || trend.every((t) => !t.responses));
  if (empty) {
    return (
      <p style={{ color: "var(--text-tertiary)", fontSize: 13.5, margin: 0 }}>
        Sem respostas no período selecionado.
      </p>
    );
  }
  return (
    <div style={{ width: "100%", height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fbGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
              <stop offset="60%" stopColor="var(--accent)" stopOpacity={0.06} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="bucket"
            stroke="var(--text-tertiary)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            yAxisId="responses"
            stroke="var(--text-tertiary)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={32}
          />
          <YAxis
            yAxisId="score"
            orientation="right"
            domain={[1, 4]}
            ticks={[1, 2, 3, 4]}
            stroke="var(--text-tertiary)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.08)", strokeDasharray: "3 3" }}
            content={<TrendTooltip />}
          />
          <Area
            yAxisId="responses"
            type="monotone"
            dataKey="responses"
            name="Respostas"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#fbGradient)"
            animationDuration={400}
          />
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="avgScore"
            name="Nota média"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={false}
            connectNulls
            animationDuration={400}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Overview["trend"][number] | undefined;
  return (
    <div
      style={{
        background: "#06130f",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 10,
        padding: "9px 12px",
        fontSize: 12.5,
        color: "var(--text-secondary)",
      }}
    >
      <div style={{ color: "var(--text-tertiary)", marginBottom: 3 }}>{label}</div>
      <div>
        <b style={{ color: "var(--accent)" }}>{row?.responses ?? 0}</b> resposta{(row?.responses ?? 0) === 1 ? "" : "s"}
      </div>
      {row?.avgScore != null && (
        <div>
          nota média <b style={{ color: "#F59E0B" }}>{row.avgScore}</b>
        </div>
      )}
    </div>
  );
}

// ── Sugestões ───────────────────────────────────────────────────────────────

function SuggestionsTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [unreadOnly, setUnreadOnly] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (unreadOnly === "unread") params.set("unread", "1");
    fetch(`${API}/api/admin/feedback/suggestions?${params}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.items || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(() => toast.error("Falha ao carregar sugestões"))
      .finally(() => setLoading(false));
  }, [page, unreadOnly, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRead = (row: SuggestionRow) => {
    fetch(`${API}/api/admin/feedback/suggestions/${row.id}/read`, {
      method: "PATCH",
      headers: hdr(),
      body: JSON.stringify({ isRead: !row.isRead }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        setRows((rs) => rs.map((x) => (x.id === row.id ? { ...x, isRead: !row.isRead } : x)));
        onChanged();
      })
      .catch(() => toast.error("Falha ao atualizar a sugestão"));
  };

  const columns: Column<SuggestionRow>[] = [
    {
      key: "user",
      header: "Cliente",
      primaryOnMobile: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.user?.name || "—"}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{r.user?.email}</div>
        </div>
      ),
    },
    {
      key: "content",
      header: "Sugestão",
      render: (r) => (
        <span style={{ whiteSpace: "pre-wrap", fontWeight: r.isRead ? 400 : 600, color: r.isRead ? "var(--text-secondary)" : "var(--text-primary)" }}>
          {r.content}
        </span>
      ),
    },
    {
      key: "channel",
      header: "Canal",
      hideOnMobile: true,
      render: (r) => (
        <StatusBadge tone={r.channel === "whatsapp" ? "good" : "info"} noDot>
          {r.channel === "whatsapp" ? "WhatsApp" : "Web"}
        </StatusBadge>
      ),
    },
    { key: "createdAt", header: "Recebida", render: (r) => fmtDateTime(r.createdAt), muted: true },
    {
      key: "isRead",
      header: "Status",
      render: (r) => (
        <StatusBadge tone={r.isRead ? "neutral" : "accent"}>{r.isRead ? "Lida" : "Nova"}</StatusBadge>
      ),
    },
  ];

  return (
    <DataTable<SuggestionRow>
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      loading={loading}
      empty={{ title: "Nenhuma sugestão", desc: "As sugestões enviadas pelos clientes aparecem aqui." }}
      toolbar={
        <SegmentedControl<"all" | "unread">
          value={unreadOnly}
          onChange={(v) => {
            setUnreadOnly(v);
            setPage(1);
          }}
          options={[
            { value: "all", label: "Todas" },
            { value: "unread", label: "Não lidas" },
          ]}
        />
      }
      rowActions={(r) => (
        <button
          type="button"
          onClick={() => toggleRead(r)}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "var(--text-secondary)",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {r.isRead ? "Marcar não lida" : "Marcar lida ✓"}
        </button>
      )}
      pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
    />
  );
}

// ── Respostas ───────────────────────────────────────────────────────────────

function ResponsesTab() {
  const toast = useToast();
  const [rows, setRows] = useState<ResponseRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 25;

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/admin/feedback/responses?page=${page}&pageSize=${pageSize}`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        setRows(d.items || []);
        setTotal(d.total || 0);
        setTotalPages(d.totalPages || 1);
      })
      .catch(() => toast.error("Falha ao carregar respostas"))
      .finally(() => setLoading(false));
  }, [page, toast]);

  const columns: Column<ResponseRow>[] = [
    {
      key: "user",
      header: "Cliente",
      primaryOnMobile: true,
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{r.user?.name || "—"}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{r.user?.email}</div>
        </div>
      ),
    },
    { key: "question", header: "Pergunta", render: (r) => r.questionLabel },
    {
      key: "answer",
      header: "Resposta",
      render: (r) =>
        r.score != null ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 3,
                background: SCORE_COLORS[(r.score || 1) - 1],
                display: "inline-block",
              }}
            />
            {r.optionText || `Nota ${r.score}`}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "channel",
      header: "Canal",
      hideOnMobile: true,
      render: (r) => (
        <StatusBadge tone={r.channel === "whatsapp" ? "good" : "info"} noDot>
          {r.channel === "whatsapp" ? "WhatsApp" : "Web"}
        </StatusBadge>
      ),
    },
    { key: "answeredAt", header: "Quando", render: (r) => fmtDateTime(r.answeredAt), muted: true },
  ];

  return (
    <DataTable<ResponseRow>
      columns={columns}
      rows={rows}
      getRowKey={(r) => r.id}
      loading={loading}
      empty={{ title: "Nenhuma resposta ainda", desc: "As respostas das sondagens e do formulário web aparecem aqui." }}
      pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
    />
  );
}
