"use client";
/**
 * Scrollytelling section for the six tools, Apple/Stripe-style.
 *
 * The outer container is tools.length × 100vh tall. A 100vh sticky pane
 * inside holds the active mockup and the active feature copy. Which tool
 * is "active" is derived from scroll progress through the tall container
 * via useScroll → useMotionValueEvent (state only changes when the index
 * actually flips, not on every frame).
 *
 * Layout adapts via CSS:
 *   ≥ 900px: two columns (text left, mockup right)
 *   < 900px: one column (mockup on top, copy below), still pinned.
 *
 * Reduced-motion users land on the last frame and skip the AnimatePresence
 * transitions.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import { TOOL_MOCKS } from "./ToolMocks";
import styles from "./StackScrolly.module.css";

/**
 * Measure the landing nav and publish its height as a CSS var on the
 * scrollytelling container. The CSS uses this var to offset the sticky
 * pane (top + height) so the nav never covers the mockup.
 *
 * Falls back to 56px (desktop nav height) if no <nav> is mounted.
 */
function useNavOffset(containerRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = containerRef.current;
    if (!container) return;
    const nav = document.querySelector<HTMLElement>("body nav");
    if (!nav) return;

    const update = () => {
      const h = nav.getBoundingClientRect().height;
      if (h > 0) container.style.setProperty("--nav-h", `${Math.ceil(h)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(nav);
    window.addEventListener("orientationchange", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, [containerRef]);
}

export interface ScrollyTool {
  key: string;
  name: string;
  verb: string;
  desc: string;
  bullets: string[];
}

interface Props {
  tools: ScrollyTool[];
  toolIcons: Record<string, React.ReactNode>;
}

export function StackScrolly({ tools, toolIcons }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();

  useNavOffset(containerRef);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    // Subtract a tiny epsilon so reaching p=1 still lands on the last index.
    const idx = Math.min(tools.length - 1, Math.max(0, Math.floor(p * tools.length - 0.001)));
    setActive((prev) => (prev === idx ? prev : idx));
  });

  const activeTool = tools[active];
  const ActiveMock = TOOL_MOCKS[activeTool?.key];

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ height: `${tools.length * 100}vh` }}
    >
      <div className={styles.sticky}>
        <div className={styles.grid}>
          {/* Mockup that cross-fades on tool change */}
          <div className={styles.mockCol}>
            <div className={styles.mockFrame}>
              <div className={styles.mockBar}>
                <span className={`${styles.mockDot} ${styles.mockDotR}`} />
                <span className={`${styles.mockDot} ${styles.mockDotY}`} />
                <span className={`${styles.mockDot} ${styles.mockDotG}`} />
                <span className={styles.mockUrl}>czero.sbs/{activeTool?.key}</span>
              </div>
              <div className={styles.mockBody}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTool?.key}
                    initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    style={{ height: "100%" }}
                  >
                    {ActiveMock ? <ActiveMock /> : null}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Active feature copy */}
          <div className={styles.textCol}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTool?.key}
                initial={reduce ? false : { opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -16 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className={styles.text}
              >
                <div className={styles.icon}>{toolIcons[activeTool?.key]}</div>
                <h3 className={styles.name}>{activeTool?.name}</h3>
                <p className={styles.verb}>{activeTool?.verb}</p>
                <p className={styles.desc}>{activeTool?.desc}</p>
                <ul className={styles.bullets}>
                  {activeTool?.bullets.map((b, j) => (
                    <li key={j}>
                      <span className={styles.bulletDot} />
                      {b}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
