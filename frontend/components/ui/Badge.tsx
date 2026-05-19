"use client";
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Badge.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "neutral" | "accent" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md";
  dot?: boolean;
  pulse?: boolean;
  children?: ReactNode;
}

export function Badge({
  variant = "neutral",
  size = "md",
  dot = false,
  pulse = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[variant], styles[size], className)} {...rest}>
      {dot && <span className={cx(styles.dot, pulse && styles.dotPulse)} aria-hidden />}
      {children}
    </span>
  );
}
