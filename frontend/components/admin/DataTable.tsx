"use client";
import { type ReactNode } from "react";
import k from "./kit.module.css";
import { Pagination } from "./controls";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  mono?: boolean;
  muted?: boolean;
  /** No mobile, esta coluna vira o título do card (senão usa a 1ª). */
  primaryOnMobile?: boolean;
  /** Rótulo alternativo no card mobile (senão usa header). */
  mobileLabel?: string;
  hideOnMobile?: boolean;
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}

const alignCls = (a?: string) => (a === "right" ? k.alignRight : a === "center" ? k.alignCenter : "");

/** Tabela canônica do admin: header sticky, densidade, skeleton, empty state
 *  embutido, fallback em cards no mobile e paginação server-driven. Substitui
 *  as 8+ tabelas hand-built espalhadas pelo painel. */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  empty,
  density = "comfortable",
  rowActions,
  onRowClick,
  pagination,
  toolbar,
  skeletonRows = 8,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  empty?: { title?: string; desc?: string };
  density?: "comfortable" | "compact";
  rowActions?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  pagination?: PaginationProps;
  toolbar?: ReactNode;
  skeletonRows?: number;
}) {
  const hasActions = !!rowActions;
  const showEmpty = !loading && rows.length === 0;
  const primary = columns.find((c) => c.primaryOnMobile) ?? columns[0];

  return (
    <div className={k.tableCard}>
      {toolbar && <div className={k.toolbar}>{toolbar}</div>}

      {/* Desktop */}
      <div className={`${k.tableScroll} ${density === "compact" ? k.compact : ""}`}>
        <table className={k.table}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={alignCls(c.align)} style={c.width ? { width: c.width } : undefined}>
                  {c.header}
                </th>
              ))}
              {hasActions && <th aria-label="Ações" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <span className={k.skelBar} style={{ width: `${45 + ((i * 11 + c.key.length * 7) % 45)}%` }} />
                    </td>
                  ))}
                  {hasActions && <td />}
                </tr>
              ))
            ) : (
              rows.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className={onRowClick ? k.rowClickable : ""}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`${alignCls(c.align)} ${c.mono ? k.cellMono : ""} ${c.muted ? k.cellMuted : ""}`}>
                      {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as ReactNode)}
                    </td>
                  ))}
                  {hasActions && (
                    <td className={k.actionsCell} onClick={(e) => e.stopPropagation()}>
                      {rowActions!(row)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      {!showEmpty && (
        <div className={k.mobileCards}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={k.mCard}>
                <span className={k.skelBar} style={{ width: "55%", height: 16 }} />
                <span className={k.skelBar} style={{ width: "80%" }} />
              </div>
            ))
          ) : (
            rows.map((row) => {
              const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
              return (
                <div
                  key={getRowKey(row)}
                  className={k.mCard}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  <div className={k.mCardHead}>
                    <span className={k.mCardTitle}>
                      {primary.render ? primary.render(row) : ((row as Record<string, unknown>)[primary.key] as ReactNode)}
                    </span>
                  </div>
                  {rest.map((c) => (
                    <div key={c.key} className={k.mRow}>
                      <span className={k.mLabel}>{c.mobileLabel ?? c.header}</span>
                      <span className={k.mValue}>
                        {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as ReactNode)}
                      </span>
                    </div>
                  ))}
                  {hasActions && (
                    <div className={k.mCardFoot} onClick={(e) => e.stopPropagation()}>
                      {rowActions!(row)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {showEmpty && (
        <div className={k.empty}>
          <span className={k.emptyIcon}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7l9-4 9 4-9 4-9-4z" />
              <path d="M3 7v10l9 4 9-4V7" />
            </svg>
          </span>
          <span className={k.emptyTitle}>{empty?.title ?? "Nada por aqui"}</span>
          {empty?.desc && <span className={k.emptyDesc}>{empty.desc}</span>}
        </div>
      )}

      {pagination && rows.length > 0 && <Pagination {...pagination} />}
    </div>
  );
}
