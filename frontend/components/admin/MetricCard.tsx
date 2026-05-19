"use client";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import type { ReactNode } from "react";
import styles from "./MetricCard.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface MetricCardProps {
  label: string;
  value?: string | number;
  suffix?: string;
  delta?: number | null;        // % change vs previous period; null = no delta shown
  sub?: ReactNode;              // optional helper text under value
  icon?: ReactNode;
  iconAccent?: boolean;
  accent?: boolean;             // true = teal-colored value + left accent stripe
  loading?: boolean;
  sparkline?: { value: number }[]; // small chart series under footer
}

const fmtDelta = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;

const Arrow = ({ dir }: { dir: "up" | "down" | "flat" }) => {
  if (dir === "flat") return <span aria-hidden>—</span>;
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {dir === "up" ? (
        <>
          <polyline points="18 15 12 9 6 15" />
        </>
      ) : (
        <>
          <polyline points="6 9 12 15 18 9" />
        </>
      )}
    </svg>
  );
};

export function MetricCard({
  label,
  value,
  suffix,
  delta,
  sub,
  icon,
  iconAccent = false,
  accent = false,
  loading = false,
  sparkline,
}: MetricCardProps) {
  const hasDelta = typeof delta === "number" && !Number.isNaN(delta);
  const deltaKind = !hasDelta
    ? null
    : delta! > 0.05
    ? "up"
    : delta! < -0.05
    ? "down"
    : "flat";

  return (
    <div className={cx(styles.card, accent && styles.cardAccent)}>
      <div className={styles.head}>
        <p className={styles.label}>{label}</p>
        {icon && (
          <span className={cx(styles.icon, iconAccent && styles.iconAccent)}>{icon}</span>
        )}
      </div>

      {loading ? (
        <div className={cx(styles.skeleton, styles.skeletonValue)} />
      ) : (
        <div className={styles.valueRow}>
          <span className={cx(styles.value, accent && styles.valueAccent)}>{value ?? "—"}</span>
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </div>
      )}

      <div className={styles.footer}>
        {sub ? <span className={styles.sub}>{sub}</span> : <span />}
        {hasDelta && (
          <span
            className={cx(
              styles.delta,
              deltaKind === "up" && styles.deltaUp,
              deltaKind === "down" && styles.deltaDown,
              deltaKind === "flat" && styles.deltaFlat
            )}
          >
            <Arrow dir={deltaKind!} />
            {fmtDelta(delta!)}
          </span>
        )}
      </div>

      {sparkline && sparkline.length > 1 && (
        <div className={styles.sparkline}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkline} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="metric-spark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"  stopColor="var(--accent)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={1.5}
                fill="url(#metric-spark)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
