"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import styles from "./Toast.module.css";

type Variant = "success" | "error" | "info" | "warning";

interface ToastInput {
  title: string;
  description?: string;
  variant?: Variant;
  duration?: number;
}

interface Toast extends ToastInput {
  id: number;
  leaving?: boolean;
}

interface ToastApi {
  show: (toast: ToastInput) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  warning: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const variantIcon: Record<Variant, ReactNode> = {
  success: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  info: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <circle cx="12" cy="8" r="0.8" fill="currentColor" />
    </svg>
  ),
  warning: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((cur) =>
      cur.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    const t = setTimeout(() => {
      setToasts((cur) => cur.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, 220);
    timersRef.current.set(id, t);
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      const id = ++idRef.current;
      const duration = toast.duration ?? (toast.variant === "error" ? 5000 : 3200);
      setToasts((cur) => [...cur, { id, variant: "info", ...toast }]);
      const t = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, t);
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const api: ToastApi = {
    show,
    success: (title, description) => show({ title, description, variant: "success" }),
    error:   (title, description) => show({ title, description, variant: "error" }),
    info:    (title, description) => show({ title, description, variant: "info" }),
    warning: (title, description) => show({ title, description, variant: "warning" }),
    dismiss,
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className={styles.viewport} role="region" aria-live="polite">
        {toasts.map((t) => {
          const variant: Variant = t.variant ?? "info";
          return (
            <div
              key={t.id}
              className={cx(styles.toast, styles[variant], t.leaving && styles.leaving)}
              role={variant === "error" ? "alert" : "status"}
            >
              <span className={styles.iconWrap}>{variantIcon[variant]}</span>
              <div className={styles.body}>
                <span className={styles.title}>{t.title}</span>
                {t.description && <span className={styles.description}>{t.description}</span>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className={styles.close}
                aria-label="Fechar"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
