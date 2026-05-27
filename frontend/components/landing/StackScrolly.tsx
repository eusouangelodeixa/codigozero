"use client";
/**
 * Scrollytelling section for the six tools, Apple/Stripe-style.
 *
 * Desktop (≥ 900px): the section is N × 100vh tall. Inside, a sticky 100vh
 * pane holds the mockup on the right and the active feature copy on the
 * left. Which tool is "active" is derived from how far the viewport has
 * scrolled through the tall container — useScroll → useMotionValueEvent
 * keeps the React state in sync without re-rendering on every frame.
 *
 * Mobile (< 900px): pinning feels bad on a phone, so we fall back to a
 * regular vertical stack with the same reveal animations the rest of the
 * landing already uses.
 */
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useScroll, useMotionValueEvent, useReducedMotion } from "motion/react";
import { TOOL_MOCKS } from "./ToolMocks";
import styles from "./StackScrolly.module.css";

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

/** SSR-safe media query — defaults to desktop on first render to avoid hydration mismatch. */
function useIsDesktop(minWidth = 900) {
  const [isDesktop, setIsDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [minWidth]);
  return isDesktop;
}

export function StackScrolly({ tools, toolIcons }: Props) {
  const isDesktop = useIsDesktop(900);
  if (!isDesktop) return <MobileStack tools={tools} toolIcons={toolIcons} />;
  return <DesktopScrolly tools={tools} toolIcons={toolIcons} />;
}

// ─── Desktop: sticky-pinned scrollytelling ────────────────────────────────

function DesktopScrolly({ tools, toolIcons }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();

  // The container is tools.length * 100vh tall; we map scroll progress
  // through the container into a [0, tools.length-1] integer.
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    // Subtract a tiny epsilon so reaching p=1 still lands on the last index.
    const idx = Math.min(tools.length - 1, Math.max(0, Math.floor(p * tools.length - 0.001)));
    setActive((prev) => (prev === idx ? prev : idx));
  });

  const ActiveMock = TOOL_MOCKS[tools[active]?.key];

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ height: `${tools.length * 100}vh` }}
    >
      <div className={styles.sticky}>
        {/* Pill counter floating in the top-right of the pinned viewport */}
        <div className={styles.counter}>
          <span className={styles.counterNum}>{String(active + 1).padStart(2, "0")}</span>
          <span className={styles.counterSep}>/</span>
          <span className={styles.counterTotal}>{String(tools.length).padStart(2, "0")}</span>
        </div>

        <div className={styles.grid}>
          {/* Left column: vertical index + currently-active copy */}
          <div className={styles.textCol}>
            <ul className={styles.index} aria-hidden>
              {tools.map((tool, i) => (
                <li
                  key={tool.key}
                  className={`${styles.indexItem} ${i === active ? styles.indexItemActive : ""}`}
                >
                  <span className={styles.indexDot} />
                  <span className={styles.indexLabel}>{tool.name}</span>
                </li>
              ))}
            </ul>

            <div className={styles.textWrap}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={tools[active]?.key}
                  initial={reduce ? false : { opacity: 0, y: 22 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -16 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className={styles.text}
                >
                  <div className={styles.icon}>{toolIcons[tools[active]?.key]}</div>
                  <h3 className={styles.name}>{tools[active]?.name}</h3>
                  <p className={styles.verb}>{tools[active]?.verb}</p>
                  <p className={styles.desc}>{tools[active]?.desc}</p>
                  <ul className={styles.bullets}>
                    {tools[active]?.bullets.map((b, j) => (
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

          {/* Right column: mockup that cross-fades on tool change */}
          <div className={styles.mockCol}>
            <div className={styles.mockFrame}>
              <div className={styles.mockBar}>
                <span className={`${styles.mockDot} ${styles.mockDotR}`} />
                <span className={`${styles.mockDot} ${styles.mockDotY}`} />
                <span className={`${styles.mockDot} ${styles.mockDotG}`} />
                <span className={styles.mockUrl}>czero.sbs/{tools[active]?.key}</span>
              </div>
              <div className={styles.mockBody}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={tools[active]?.key}
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
        </div>
      </div>
    </div>
  );
}

// ─── Mobile: vertical stack with reveal-on-scroll ────────────────────────

function MobileStack({ tools, toolIcons }: Props) {
  const reduce = useReducedMotion();
  return (
    <div className={styles.mobileStack}>
      {tools.map((tool, i) => {
        const Mock = TOOL_MOCKS[tool.key];
        return (
          <motion.article
            key={tool.key}
            className={styles.mobileItem}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.55, delay: 0.05 * i, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={styles.mobileText}>
              <div className={styles.icon}>{toolIcons[tool.key]}</div>
              <h3 className={styles.name}>{tool.name}</h3>
              <p className={styles.verb}>{tool.verb}</p>
              <p className={styles.desc}>{tool.desc}</p>
              <ul className={styles.bullets}>
                {tool.bullets.map((b, j) => (
                  <li key={j}>
                    <span className={styles.bulletDot} />
                    {b}
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.mobileMock}>
              <div className={styles.mockFrame}>
                <div className={styles.mockBar}>
                  <span className={`${styles.mockDot} ${styles.mockDotR}`} />
                  <span className={`${styles.mockDot} ${styles.mockDotY}`} />
                  <span className={`${styles.mockDot} ${styles.mockDotG}`} />
                  <span className={styles.mockUrl}>czero.sbs/{tool.key}</span>
                </div>
                <div className={styles.mockBody}>{Mock ? <Mock /> : null}</div>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
