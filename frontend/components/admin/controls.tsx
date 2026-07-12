"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import k from "./kit.module.css";

type Tone = "good" | "warn" | "danger" | "accent" | "neutral" | "info";

const STATUS_MAPS: Record<string, Record<string, { label: string; tone: Tone }>> = {
  subscription: {
    active: { label: "Ativo", tone: "good" },
    grace_period: { label: "Carência", tone: "warn" },
    overdue: { label: "Atrasado", tone: "danger" },
    canceled: { label: "Cancelado", tone: "danger" },
    lead: { label: "Lead", tone: "neutral" },
  },
  transaction: {
    approved: { label: "Aprovada", tone: "good" },
    pending: { label: "Pendente", tone: "warn" },
    failed: { label: "Falhou", tone: "danger" },
    refunded: { label: "Reembolsada", tone: "neutral" },
  },
  withdrawal: {
    pending: { label: "Pendente", tone: "warn" },
    paid: { label: "Pago", tone: "good" },
    rejected: { label: "Rejeitado", tone: "danger" },
  },
};

/** Badge de status com um único mapa status→tom (assinatura/transação/saque),
 *  ou tom+conteúdo livre. Aposenta os statusClass duplicados por página. */
export function StatusBadge({
  kind,
  value,
  tone,
  children,
  noDot,
}: {
  kind?: "subscription" | "transaction" | "withdrawal";
  value?: string;
  tone?: Tone;
  children?: ReactNode;
  noDot?: boolean;
}) {
  let t: Tone = tone ?? "neutral";
  let label: ReactNode = children ?? value ?? "—";
  if (kind && value && STATUS_MAPS[kind]?.[value]) {
    t = STATUS_MAPS[kind][value].tone;
    label = STATUS_MAPS[kind][value].label;
  }
  return <span className={`${k.badge} ${k[`tone-${t}`]} ${noDot ? k.badgeNoDot : ""}`}>{label}</span>;
}

/** Busca com ícone + debounce interno (não dispara no mount). */
export function SearchInput({
  defaultValue = "",
  onSearch,
  placeholder = "Buscar…",
  debounceMs = 300,
}: {
  defaultValue?: string;
  onSearch: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
}) {
  const [v, setV] = useState(defaultValue);
  const ref = useRef(onSearch);
  ref.current = onSearch;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => ref.current(v.trim()), debounceMs);
    return () => clearTimeout(id);
  }, [v, debounceMs]);
  return (
    <div className={k.search}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        className={k.searchInput}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        aria-label={placeholder}
      />
    </div>
  );
}

/** Controle segmentado (status/tipo). Aposenta os pills bespoke. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className={k.segmented} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`${k.segItem} ${value === o.value ? k.segItemActive : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Rodapé de paginação (server-driven). */
export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const last = Math.max(1, totalPages);
  return (
    <div className={k.pagination}>
      <span className={k.pageInfo}>
        <b>
          {from}–{to}
        </b>{" "}
        de <b>{total.toLocaleString("pt-BR")}</b>
      </span>
      <div className={k.pageControls}>
        <button type="button" className={k.pageBtn} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          ‹ Anterior
        </button>
        <span className={k.pageCurrent}>
          {page} / {last}
        </span>
        <button type="button" className={k.pageBtn} disabled={page >= last} onClick={() => onChange(page + 1)}>
          Próxima ›
        </button>
      </div>
    </div>
  );
}

export interface RowAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

/** Menu kebab (⋯) que colapsa as ações da linha. Renderiza o menu num portal
 *  (position:fixed) para não ser cortado pelo overflow do container da tabela. */
export function RowActions({ items, label = "Ações" }: { items: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className={k.kebabWrap}>
      <button
        ref={btnRef}
        type="button"
        className={`${k.kebab} ${open ? k.kebabOpen : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 29 }} onClick={() => setOpen(false)} />
            <div className={k.menu} role="menu" style={{ position: "fixed", top: pos.top, right: pos.right }}>
              {items.map((it, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  className={`${k.menuItem} ${it.danger ? k.menuItemDanger : ""}`}
                  onClick={() => {
                    setOpen(false);
                    it.onClick();
                  }}
                >
                  {it.icon}
                  {it.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
