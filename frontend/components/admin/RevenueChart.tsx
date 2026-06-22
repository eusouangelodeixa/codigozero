"use client";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import styles from "./RevenueChart.module.css";

interface TooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string;
  name?: string;
  payload?: RevenueDatum; // the full data row for this point
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export type Period = "7d" | "30d" | "12m";

const PERIOD_LABELS: Record<Period, string> = {
  "7d":  "7d",
  "30d": "30d",
  "12m": "12m",
};

export interface RevenueDatum {
  date: string;
  amount: number;
  count?: number;        // bars (renewal revenue)
  newCount?: number;     // # of new sales that day (tooltip)
  renewalCount?: number; // # of renewals that day (tooltip)
}

interface RevenueChartProps {
  data: RevenueDatum[];
  period: Period;
  onPeriodChange?: (next: Period) => void;
  total?: number;            // total of the period (for big number)
  delta?: number | null;     // % change vs previous period
  title?: string;
  eyebrow?: string;
  loading?: boolean;
  compact?: boolean;
  showCount?: boolean;       // show transaction count as bars
  actions?: ReactNode;       // additional actions in the head
  formatCurrency?: (n: number) => string;
  formatDate?: (d: string) => string;
}

const defaultMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", {
    style: "currency",
    currency: "MZN",
    maximumFractionDigits: 0,
  }).format(n);

const compactMoney = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
};

const fmtDelta = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

function ChartTooltip({
  active,
  payload,
  label,
  fmt,
}: ChartTooltipProps & { fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const amountEntry = payload.find((p) => p.dataKey === "amount");
  const amount = typeof amountEntry?.value === "number" ? amountEntry.value : undefined;
  // Real transaction counts ride on the full datum (not rendered as series).
  const row = payload[0]?.payload;
  const newCount = typeof row?.newCount === "number" ? row.newCount : undefined;
  const renewalCount = typeof row?.renewalCount === "number" ? row.renewalCount : undefined;
  const hasCounts = newCount !== undefined || renewalCount !== undefined;
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipLabel}>{label}</span>
      <span className={styles.tooltipValue}>{typeof amount === "number" ? fmt(amount) : "—"}</span>
      {hasCounts && (
        <span className={styles.tooltipSub}>
          {newCount ?? 0} nova{(newCount ?? 0) === 1 ? "" : "s"}
          {" · "}
          {renewalCount ?? 0} renovaç{(renewalCount ?? 0) === 1 ? "ão" : "ões"}
        </span>
      )}
    </div>
  );
}

export function RevenueChart({
  data,
  period,
  onPeriodChange,
  total,
  delta,
  title = "Evolução da receita",
  eyebrow = "Receita",
  loading = false,
  compact = false,
  showCount = false,
  actions,
  formatCurrency = defaultMoney,
  formatDate,
}: RevenueChartProps) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const deltaKind = !hasDelta
    ? "flat"
    : delta! > 0.05
    ? "up"
    : delta! < -0.05
    ? "down"
    : "flat";

  const empty = !loading && (!data || data.length === 0 || data.every((d) => !d.amount));

  return (
    <div className={styles.card}>
      <header className={styles.head}>
        <div className={styles.headMeta}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 className={styles.title}>{title}</h2>
          {typeof total === "number" && (
            <div className={styles.summary}>
              <span className={styles.summaryValue}>{formatCurrency(total)}</span>
              {hasDelta && (
                <span
                  className={cx(
                    styles.summaryDelta,
                    deltaKind === "up" && styles.summaryDeltaUp,
                    deltaKind === "down" && styles.summaryDeltaDown,
                    deltaKind === "flat" && styles.summaryDeltaFlat
                  )}
                >
                  {fmtDelta(delta!)}
                </span>
              )}
            </div>
          )}
          {showCount && (
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "var(--accent)" }} />
                Receita
              </span>
              <span className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: "rgba(255,255,255,0.18)" }} />
                Transações
              </span>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          {actions}
          {onPeriodChange && (
            <div className={styles.periodSwitch} role="tablist">
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={p === period}
                  className={cx(styles.periodOption, p === period && styles.periodOptionActive)}
                  onClick={() => onPeriodChange(p)}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className={cx(styles.body, compact && styles.compact)}>
        {empty ? (
          <span className={styles.empty}>Sem receita no período selecionado.</span>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="var(--accent)" stopOpacity={0.35} />
                  <stop offset="60%" stopColor="var(--accent)" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="2 4"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                stroke="var(--text-tertiary)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                tickFormatter={formatDate}
                interval="preserveStartEnd"
                minTickGap={20}
              />
              <YAxis
                yAxisId="amount"
                stroke="var(--text-tertiary)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => compactMoney(v)}
                width={48}
              />
              {showCount && (
                <YAxis
                  yAxisId="count"
                  orientation="right"
                  stroke="var(--text-tertiary)"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => String(v)}
                  width={32}
                />
              )}
              <Tooltip
                cursor={{ stroke: "rgba(255,255,255,0.08)", strokeDasharray: "3 3" }}
                content={<ChartTooltip fmt={formatCurrency} />}
              />

              {showCount && (
                <Bar
                  yAxisId="count"
                  dataKey="count"
                  fill="rgba(255,255,255,0.07)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={12}
                />
              )}

              <Area
                yAxisId="amount"
                type="monotone"
                dataKey="amount"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#revGradient)"
                activeDot={{
                  r: 5,
                  fill: "var(--accent)",
                  stroke: "var(--bg-base)",
                  strokeWidth: 2,
                }}
                animationDuration={400}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
