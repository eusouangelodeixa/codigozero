"use client";
// Tour guiado (coachmarks) — spotlight sobre elementos reais da interface,
// no estilo dos onboardings de produto das grandes empresas. Sem libs:
// overlay fixo + "buraco" de luz via box-shadow gigante + tooltip ancorado.
//
// Uso: marque os alvos com data-tour="chave" e passe os passos. Alvos
// invisíveis no momento (ex.: sidebar no mobile) são pulados sozinhos.
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./tour.module.css";

export interface TourStep {
  target: string; // valor do data-tour
  title: string;
  body: string;
}

interface Rect { top: number; left: number; width: number; height: number; }

const PAD = 8;

function findVisible(target: string): HTMLElement | null {
  const els = document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`);
  for (const el of Array.from(els)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && el.offsetParent !== null) return el;
  }
  return null;
}

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (completed: boolean) => void }) {
  // Filtra na largada os passos cujo alvo existe e está visível.
  const [liveSteps] = useState<TourStep[]>(() => steps.filter((s) => findVisible(s.target)));
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const rafRef = useRef<number | null>(null);

  const step = liveSteps[idx];

  const measure = useCallback(() => {
    if (!step) return;
    const el = findVisible(step.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  // Ao trocar de passo: rola o alvo pro centro e mede (de novo após o scroll).
  useEffect(() => {
    if (!step) return;
    const el = findVisible(step.target);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    measure();
    const t = setTimeout(measure, 380);
    return () => clearTimeout(t);
  }, [step, measure]);

  // Re-mede em resize/scroll (captura pega o scroller interno do AppShell).
  useEffect(() => {
    const onMove = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        measure();
      });
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [measure]);

  // Teclado: Esc pula; setas navegam.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false);
      if (e.key === "ArrowRight") setIdx((i) => Math.min(i + 1, liveSteps.length - 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveSteps.length, onClose]);

  if (!step || liveSteps.length === 0) return null;

  const isLast = idx === liveSteps.length - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const isMobile = vw < 560;

  // Tooltip: embaixo do alvo quando há espaço; senão em cima; no mobile vira
  // uma folha fixa no rodapé (sempre legível, nunca coberta pelo teclado).
  const tooltipStyle: React.CSSProperties = {};
  if (!isMobile && rect) {
    const below = rect.top + rect.height + 240 < vh;
    tooltipStyle.top = below ? rect.top + rect.height + 14 : undefined;
    tooltipStyle.bottom = below ? undefined : vh - rect.top + 14;
    tooltipStyle.left = Math.max(16, Math.min(rect.left, vw - 372));
  }

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Tour guiado">
      {/* Bloqueia cliques por trás */}
      <div className={styles.blocker} onClick={() => {}} />

      {/* Spotlight */}
      {rect && (
        <div
          className={styles.spotlight}
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
          aria-hidden
        />
      )}

      {/* Tooltip */}
      <div className={`${styles.tooltip} ${isMobile ? styles.tooltipSheet : ""}`} style={tooltipStyle}>
        <div className={styles.tooltipEyebrow}>
          <span>{idx + 1} de {liveSteps.length}</span>
          <button type="button" className={styles.skip} onClick={() => onClose(false)}>Pular tour</button>
        </div>
        <div className={styles.tooltipTitle}>{step.title}</div>
        <div className={styles.tooltipBody}>{step.body}</div>
        <div className={styles.tooltipDots} aria-hidden>
          {liveSteps.map((_, i) => (
            <span key={i} className={`${styles.dot} ${i === idx ? styles.dotOn : ""}`} />
          ))}
        </div>
        <div className={styles.tooltipActions}>
          {idx > 0 && (
            <button type="button" className={styles.btnGhost} onClick={() => setIdx(idx - 1)}>← Voltar</button>
          )}
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => (isLast ? onClose(true) : setIdx(idx + 1))}
          >
            {isLast ? "Concluir ✓" : "Próximo →"}
          </button>
        </div>
      </div>
    </div>
  );
}
