"use client";
import styles from "./DateRangeFilter.module.css";

export interface DateRange {
  period: string; // all | today | 7d | 30d | custom
  from?: string;
  to?: string;
}

const PERIODS = [
  { id: "all", label: "Tudo" },
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "Mês" },
  { id: "custom", label: "Personalizado" },
];

/**
 * Period chips (Tudo / Hoje / 7 dias / Mês / Personalizado) shared by the
 * admin leads, users and broadcast screens. Emits `{ period, from, to }` —
 * the backend turns it into a createdAt window via dateWindowFromQuery.
 */
export default function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (v: DateRange) => void;
}) {
  return (
    <div className={styles.wrap}>
      {PERIODS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`${styles.chip} ${value.period === p.id ? styles.chipActive : ""}`}
          onClick={() => onChange({ ...value, period: p.id })}
        >
          {p.label}
        </button>
      ))}
      {value.period === "custom" && (
        <span className={styles.customRange}>
          <input
            type="date"
            className={styles.dateInput}
            value={value.from || ""}
            max={value.to || undefined}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
          />
          <span className={styles.dash}>—</span>
          <input
            type="date"
            className={styles.dateInput}
            value={value.to || ""}
            min={value.from || undefined}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
          />
        </span>
      )}
    </div>
  );
}
