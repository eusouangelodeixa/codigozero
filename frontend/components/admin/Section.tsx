"use client";
import { useState, type ReactNode } from "react";
import styles from "./Section.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface SectionProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  actions?: ReactNode;        // rendered on the right side of the header
  children: ReactNode;
}

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export function Section({
  title,
  subtitle,
  icon,
  defaultOpen = true,
  collapsible = true,
  actions,
  children,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.section}>
      <div
        className={cx(styles.head, !collapsible && styles.headStatic)}
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((v) => !v);
                }
              }
            : undefined
        }
        aria-expanded={collapsible ? open : undefined}
      >
        <div className={styles.headInner}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <div className={styles.titleBlock}>
            <h3 className={styles.title}>{title}</h3>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
        </div>

        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
          {actions}
          {collapsible && (
            <span className={cx(styles.chevron, open && styles.chevronOpen)} aria-hidden>
              <Chevron />
            </span>
          )}
        </div>
      </div>

      <div className={cx(styles.body, !open && styles.bodyClosed)}>{children}</div>
    </div>
  );
}

/** Two-column grid helper inside a section body. */
export function SectionGrid({ children, full }: { children: ReactNode; full?: boolean }) {
  return (
    <div className={cx(styles.bodyGrid, full && styles.bodyGridFull)}>{children}</div>
  );
}
