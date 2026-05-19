"use client";
import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
  useId,
} from "react";
import styles from "./Input.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

type FieldShared = {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  size?: "sm" | "md" | "lg";
  adornmentStart?: ReactNode;
  adornmentEnd?: ReactNode;
  className?: string;
};

const FieldShell = ({
  label,
  hint,
  error,
  required,
  id,
  size = "md",
  className,
  children,
  invalid,
}: FieldShared & { id?: string; children: ReactNode; invalid?: boolean }) => (
  <label htmlFor={id} className={cx(styles.field, size === "sm" && styles.sizeSm, size === "lg" && styles.sizeLg, className)}>
    {label && (
      <span className={styles.label}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </span>
    )}
    <span className={cx(styles.wrap, invalid && styles.invalid)}>{children}</span>
    {error ? <span className={styles.error}>{error}</span> : hint && <span className={styles.hint}>{hint}</span>}
  </label>
);

/* ── Input ── */
export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    FieldShared {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, size, adornmentStart, adornmentEnd, className, id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <FieldShell
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      size={size}
      className={className}
      invalid={!!error}
    >
      {adornmentStart && <span className={styles.adornmentStart}>{adornmentStart}</span>}
      <input ref={ref} id={inputId} required={required} className={styles.input} {...rest} />
      {adornmentEnd && <span className={styles.adornmentEnd}>{adornmentEnd}</span>}
    </FieldShell>
  );
});

/* ── Textarea ── */
export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size">,
    FieldShared {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, size, className, id, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <FieldShell
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      size={size}
      className={className}
      invalid={!!error}
    >
      <textarea ref={ref} id={inputId} required={required} className={styles.textarea} {...rest} />
    </FieldShell>
  );
});

/* ── Select ── */
export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">,
    FieldShared {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, size, className, id, children, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  return (
    <FieldShell
      id={inputId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      size={size}
      className={className}
      invalid={!!error}
    >
      <select ref={ref} id={inputId} required={required} className={styles.select} {...rest}>
        {children}
      </select>
      <svg className={styles.selectCaret} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </FieldShell>
  );
});
