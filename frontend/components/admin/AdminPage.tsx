"use client";
import { type ReactNode } from "react";
import k from "./kit.module.css";

/** Shell de página do admin: cabeçalho consistente (eyebrow/título/descrição +
 *  ação primária à direita), slot opcional de KPIs, e o conteúdo. Toda página
 *  do painel abre igual — fim dos cabeçalhos divergentes. */
export function AdminPage({
  eyebrow,
  title,
  desc,
  actions,
  kpis,
  children,
}: {
  eyebrow?: string;
  title: string;
  desc?: string;
  actions?: ReactNode;
  kpis?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={k.page}>
      <header className={k.header}>
        <div className={k.headingBlock}>
          {eyebrow && <div className={k.eyebrow}>{eyebrow}</div>}
          <h1 className={k.title}>{title}</h1>
          {desc && <p className={k.desc}>{desc}</p>}
        </div>
        {actions && <div className={k.headerActions}>{actions}</div>}
      </header>
      {kpis}
      {children}
    </div>
  );
}

/** Grade responsiva de KPIs (auto-fit). Use com <StatTile>. */
export function StatRow({ children }: { children: ReactNode }) {
  return <div className={k.statRow}>{children}</div>;
}

/** Tile de KPI canônico das listas: rótulo, valor grande (tabular), dica opcional. */
export function StatTile({
  label,
  value,
  hint,
  icon,
  accent,
  tone,
  loading,
}: {
  label: string;
  value?: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: boolean;
  tone?: "warn" | "danger" | "good";
  loading?: boolean;
}) {
  const toneClass =
    tone === "warn" ? k.statWarn : tone === "danger" ? k.statDanger : tone === "good" ? k.statGood : "";
  return (
    <div className={`${k.stat} ${accent ? k.statAccent : ""}`}>
      <span className={k.statLabel}>
        {icon && <span className={k.statIcon}>{icon}</span>}
        {label}
      </span>
      {loading ? (
        <span className={k.skelBar} style={{ width: 72, height: 24 }} />
      ) : (
        <span className={`${k.statValue} ${toneClass}`}>{value ?? "—"}</span>
      )}
      {hint && <span className={k.statHint}>{hint}</span>}
    </div>
  );
}
