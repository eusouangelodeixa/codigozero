"use client";
import { useState, useRef, type ReactNode } from "react";
import styles from "./SecretField.module.css";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

export interface SecretFieldProps {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  /** When true, the value is masked (type=password) until the eye is clicked; default true */
  maskable?: boolean;
  disabled?: boolean;
  showStatus?: boolean;
}

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
        <path d="M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
        <path d="M14.12 14.12A3 3 0 119.88 9.88" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

export function SecretField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  maskable = true,
  disabled = false,
  showStatus = true,
}: SecretFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSet = !!value && value.length > 0;

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <label className={styles.field}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        {showStatus && (
          <span className={cx(styles.statusBadge, isSet ? styles.statusOk : styles.statusEmpty)}>
            {isSet ? "Configurado" : "Vazio"}
          </span>
        )}
      </div>
      <div className={styles.wrap}>
        <input
          ref={inputRef}
          className={styles.input}
          // Mask VISUALLY with type=password — the bound value is ALWAYS the real
          // secret, so the masked dots can never leak into what gets saved.
          type={maskable && !revealed ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          data-form-type="other"
          disabled={disabled}
          aria-label={label}
        />
        {maskable && isSet && (
          <button
            type="button"
            className={cx(styles.iconBtn, revealed && styles.iconBtnActive)}
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? "Ocultar" : "Mostrar"}
            title={revealed ? "Ocultar" : "Mostrar"}
            disabled={disabled}
          >
            <EyeIcon open={revealed} />
          </button>
        )}
        {isSet && (
          <button
            type="button"
            className={styles.iconBtn}
            onClick={handleCopy}
            aria-label="Copiar"
            title="Copiar"
            disabled={disabled}
          >
            <CopyIcon />
          </button>
        )}
        <span className={cx(styles.copyToast, copied && styles.copyToastVisible)} aria-live="polite">
          Copiado
        </span>
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </label>
  );
}
