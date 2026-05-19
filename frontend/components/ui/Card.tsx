"use client";
import { forwardRef, type HTMLAttributes, type ElementType, type ReactNode } from "react";
import styles from "./Card.module.css";

type Pad = "none" | "sm" | "md" | "lg";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: "default" | "elevated";
  interactive?: boolean;
  accentHover?: boolean;
  padding?: Pad;
  children?: ReactNode;
}

const padMap: Record<Pad, string> = {
  none: "padNone",
  sm:   "padSm",
  md:   "padMd",
  lg:   "padLg",
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  {
    as: Tag = "div",
    variant = "default",
    interactive = false,
    accentHover = false,
    padding = "md",
    className,
    children,
    ...rest
  },
  ref
) {
  const Component = Tag as ElementType;
  return (
    <Component
      ref={ref as never}
      className={cx(
        styles.card,
        variant === "elevated" && styles.elevated,
        interactive && styles.interactive,
        accentHover && styles.accentHover,
        styles[padMap[padding]],
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
});
