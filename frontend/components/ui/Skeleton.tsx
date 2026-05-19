import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Skeleton({
  variant = "line",
  width,
  height,
  className,
  style,
}: {
  variant?: "line" | "title" | "block" | "avatar";
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  const computed: CSSProperties = { ...style };
  if (width !== undefined) computed.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined) computed.height = typeof height === "number" ? `${height}px` : height;
  return <span className={cx(styles.skeleton, styles[variant], className)} style={computed} aria-hidden />;
}
