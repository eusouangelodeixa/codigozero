"use client";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "hero";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    iconStart,
    iconEnd,
    loading = false,
    fullWidth = false,
    iconOnly = false,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        styles.btn,
        styles[variant],
        styles[size],
        loading && styles.loading,
        fullWidth && styles.fullWidth,
        iconOnly && styles.iconOnly,
        className
      )}
      {...rest}
    >
      {iconStart && <span className={styles.iconStart}>{iconStart}</span>}
      {!iconOnly && <span className={styles.label}>{children}</span>}
      {iconOnly && <span className={styles.label}>{children}</span>}
      {iconEnd && <span className={styles.iconEnd}>{iconEnd}</span>}
      {loading && <span className={styles.spinner} aria-hidden />}
    </button>
  );
});
