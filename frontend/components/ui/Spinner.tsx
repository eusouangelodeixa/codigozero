import styles from "./Spinner.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export function Spinner({
  size = "md",
  accent = false,
  className,
  label = "Carregando",
}: {
  size?: "sm" | "md" | "lg";
  accent?: boolean;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cx(styles.spinner, styles[size], accent && styles.accent, className)}
    />
  );
}
