"use client";
/**
 * Animated mockups for each of the six Código Zero tools.
 *
 * Each mock auto-loops a short sequence that shows what the tool actually does
 * — not generic UI placeholders. Loops are between 4 and 8 seconds and respect
 * prefers-reduced-motion (in which case the final state is rendered statically).
 *
 * These render inside the .mockBody slot of the landing's .mockFrame chrome,
 * so they don't ship their own browser bar.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Check, Folder, FileCode } from "lucide-react";
import styles from "./ToolMocks.module.css";

// ─── Shared ──────────────────────────────────────────────────────────────────

function useLoopStep(intervalMs: number, total: number) {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce) {
      setStep(total - 1);
      return;
    }
    const id = setInterval(() => setStep((s) => (s + 1) % total), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, total, reduce]);
  return { step, reduce };
}

// ─── 1. RADAR — varredura de leads ─────────────────────────────────────────
//
// Background = grid de mapa. Um anel de "scanner" expande do centro a cada
// pulso. Pontos verdes representam leads aparecendo. Lista lateral preenche
// com os nomes assim que cada ponto surge.

const RADAR_LEADS = [
  { name: "Pizzaria Italiana", phone: "+258 84 312...", x: 28, y: 30 },
  { name: "Hotel Costa Sol", phone: "+258 82 998...", x: 65, y: 22 },
  { name: "Clínica Saúde+", phone: "+258 87 145...", x: 78, y: 60 },
  { name: "Auto Moz Lda", phone: "+258 84 770...", x: 18, y: 70 },
  { name: "Café Central", phone: "+258 86 502...", x: 50, y: 78 },
];

export function MockRadar() {
  const reduce = useReducedMotion();
  return (
    <div className={styles.radar}>
      <div className={styles.radarHeader}>
        <span className={styles.radarChip}>Maputo · Restaurantes</span>
        <span className={styles.radarStatus}>
          <span className={styles.radarStatusDot} />
          A varrer
        </span>
      </div>

      <div className={styles.radarBody}>
        <div className={styles.radarMap}>
          {/* Anéis de scanner pulsando */}
          {!reduce && (
            <>
              <motion.div
                className={styles.radarRing}
                initial={{ scale: 0, opacity: 0.6 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.div
                className={styles.radarRing}
                initial={{ scale: 0, opacity: 0.6 }}
                animate={{ scale: 4, opacity: 0 }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 1.5 }}
              />
            </>
          )}
          <span className={styles.radarCenter} />

          {/* Pontos de leads aparecendo sequencialmente */}
          {RADAR_LEADS.map((lead, i) => (
            <motion.span
              key={i}
              className={styles.radarPoint}
              style={{ left: `${lead.x}%`, top: `${lead.y}%` }}
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                duration: 0.4,
                delay: reduce ? 0 : 0.4 + i * 0.6,
                repeat: reduce ? 0 : Infinity,
                repeatDelay: 3,
                repeatType: "reverse",
              }}
            />
          ))}
        </div>

        <ul className={styles.radarList}>
          {RADAR_LEADS.slice(0, 4).map((lead, i) => (
            <motion.li
              key={i}
              className={styles.radarItem}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.35,
                delay: reduce ? 0 : 0.6 + i * 0.6,
                repeat: reduce ? 0 : Infinity,
                repeatDelay: 3,
                repeatType: "reverse",
              }}
            >
              <span className={styles.radarItemDot} />
              <div>
                <span className={styles.radarItemName}>{lead.name}</span>
                <span className={styles.radarItemPhone}>{lead.phone}</span>
              </div>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── 2. DISPARADOR — envio em massa ─────────────────────────────────────────
//
// Lista de contatos. Cada linha começa "pendente" e vai virando "enviado" em
// sequência. Counter no topo conta em tempo real. Anti-block dot pisca a cada
// envio.

const DISP_CONTACTS = [
  "Mariana S.",
  "João Pedro M.",
  "Ana Cristina F.",
  "Carlos T.",
  "Sónia G.",
  "Bruno L.",
  "Helena V.",
];

export function MockDisparador() {
  const reduce = useReducedMotion();
  const total = DISP_CONTACTS.length;
  const { step } = useLoopStep(900, total + 2);
  const sent = Math.min(step, total);
  const pct = Math.round((sent / total) * 100);

  return (
    <div className={styles.disp}>
      <div className={styles.dispHeader}>
        <div>
          <div className={styles.dispTitle}>Campanha · Outbound B2B</div>
          <div className={styles.dispSub}>{sent} de {total} enviadas</div>
        </div>
        <motion.div
          className={styles.dispCounter}
          key={sent}
          initial={reduce ? false : { scale: 1.15, color: "#2dd4bf" }}
          animate={{ scale: 1, color: "#fff" }}
          transition={{ duration: 0.3 }}
        >
          {pct}%
        </motion.div>
      </div>

      <div className={styles.dispBar}>
        <motion.div
          className={styles.dispBarFill}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <ul className={styles.dispList}>
        {DISP_CONTACTS.map((name, i) => {
          const done = i < sent;
          return (
            <li key={i} className={styles.dispItem}>
              <span className={`${styles.dispAvatar} ${done ? styles.dispAvatarDone : ""}`}>
                {name.charAt(0)}
              </span>
              <span className={styles.dispName}>{name}</span>
              <AnimatePresence mode="wait">
                {done ? (
                  <motion.span
                    key="ok"
                    className={styles.dispStatusOk}
                    initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Check size={12} strokeWidth={3} />
                    Enviado
                  </motion.span>
                ) : (
                  <span key="pending" className={styles.dispStatusPending}>
                    <span className={styles.dispPendingDot} />
                  </span>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── 3. COFRE — biblioteca de scripts ──────────────────────────────────────
//
// Card de script em destaque. Texto digitando linha-a-linha. Botão "Copiar"
// pulsa, vira "✓ Copiado" por 1s, volta. Loop.

const COFRE_LINES = [
  "Olá {{nome}}, sou da equipa Código Zero.",
  "Vi que a {{empresa}} ainda não usa IA para",
  "responder no WhatsApp. Posso mostrar como",
  "automatizar isso em 7 dias?",
];

export function MockCofre() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"typing" | "copy" | "done">("typing");
  const [lineCount, setLineCount] = useState(reduce ? COFRE_LINES.length : 0);

  useEffect(() => {
    if (reduce) {
      setPhase("done");
      return;
    }
    let stop = false;

    const run = async () => {
      while (!stop) {
        setPhase("typing");
        setLineCount(0);
        for (let i = 1; i <= COFRE_LINES.length; i++) {
          await new Promise((r) => setTimeout(r, 600));
          if (stop) return;
          setLineCount(i);
        }
        await new Promise((r) => setTimeout(r, 600));
        if (stop) return;
        setPhase("copy");
        await new Promise((r) => setTimeout(r, 1100));
        if (stop) return;
        setPhase("done");
        await new Promise((r) => setTimeout(r, 1500));
      }
    };
    run();
    return () => { stop = true; };
  }, [reduce]);

  return (
    <div className={styles.cofre}>
      <div className={styles.cofreHeader}>
        <span className={styles.cofreFolder}>
          <Folder size={12} strokeWidth={1.8} style={{ verticalAlign: "-2px", marginRight: 4 }} />
          Outbound · WhatsApp
        </span>
        <span className={styles.cofreCount}>27 scripts</span>
      </div>

      <div className={styles.cofreCard}>
        <div className={styles.cofreCardHead}>
          <span className={styles.cofreName}>
            <FileCode size={11} strokeWidth={1.8} style={{ verticalAlign: "-2px", marginRight: 4 }} />
            script-frio-b2b.md
          </span>
          <motion.button
            className={`${styles.cofreCopyBtn} ${phase === "copy" || phase === "done" ? styles.cofreCopyBtnActive : ""}`}
            initial={false}
            animate={phase === "copy" ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            {phase === "done" ? "✓ Copiado" : phase === "copy" ? "Copiando..." : "Copiar"}
          </motion.button>
        </div>
        <div className={styles.cofreBody}>
          {COFRE_LINES.map((line, i) => (
            <motion.div
              key={i}
              className={styles.cofreLine}
              initial={false}
              animate={{ opacity: i < lineCount ? 1 : 0.15 }}
              transition={{ duration: 0.25 }}
            >
              <span className={styles.cofreLineNum}>{String(i + 1).padStart(2, "0")}</span>
              <span>{line}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 4. FORJA — aulas práticas ─────────────────────────────────────────────
//
// Lista de lições de um módulo. Uma sendo "assistida" tem barra de progresso
// que enche. Ao chegar em 100%, vira ✓ check verde, e a próxima fica ativa.

const FORJA_LESSONS = [
  { title: "Setup da conta n8n", done: true },
  { title: "Webhook do WhatsApp", done: true },
  { title: "Conectar com ChatGPT", done: false, active: true },
  { title: "Resposta automática", done: false },
  { title: "Deploy do agente", done: false },
];

export function MockForja() {
  const reduce = useReducedMotion();
  return (
    <div className={styles.forja}>
      <div className={styles.forjaHeader}>
        <div className={styles.forjaModule}>Módulo 2 · Automações no n8n</div>
        <div className={styles.forjaProgress}>2/5 lições</div>
      </div>

      <ul className={styles.forjaList}>
        {FORJA_LESSONS.map((lesson, i) => (
          <li
            key={i}
            className={`${styles.forjaItem} ${
              lesson.done ? styles.forjaItemDone : lesson.active ? styles.forjaItemActive : ""
            }`}
          >
            <span className={styles.forjaCheck}>
              {lesson.done ? (
                <Check size={14} strokeWidth={3} />
              ) : (
                String(i + 1).padStart(2, "0")
              )}
            </span>
            <span className={styles.forjaTitle}>{lesson.title}</span>
            {lesson.active && (
              <div className={styles.forjaProgressBar}>
                <motion.div
                  className={styles.forjaProgressFill}
                  initial={reduce ? { width: "62%" } : { width: "0%" }}
                  animate={{ width: ["0%", "62%", "62%", "0%"] }}
                  transition={{
                    duration: 6,
                    repeat: reduce ? 0 : Infinity,
                    times: [0, 0.45, 0.85, 1],
                    ease: "easeInOut",
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── 5. QG — comunidade + próxima call ─────────────────────────────────────
//
// Card central com countdown ao vivo pra próxima call de domingo. O timer
// realmente conta os segundos (computado em tempo real). Botão pulsa.

function nextSunday(): Date {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay();
  const offset = day === 0 ? 7 : 7 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(20, 0, 0, 0); // 20h
  return d;
}

export function MockQG() {
  const reduce = useReducedMotion();
  const target = useMemo(() => nextSunday(), []);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    if (reduce) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [reduce]);

  const diff = now ? Math.max(0, target.getTime() - now.getTime()) : 0;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const cells = [
    { v: days, l: "dias" },
    { v: hours, l: "horas" },
    { v: mins, l: "min" },
    { v: secs, l: "seg" },
  ];

  return (
    <div className={styles.qg}>
      <div className={styles.qgHeader}>
        <span className={styles.qgChip}>Próxima call · Domingo · 20h</span>
        <div className={styles.qgAvatars}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={styles.qgAvatar}>{["A", "M", "J", "+"][i]}</span>
          ))}
        </div>
      </div>

      <div className={styles.qgTimer}>
        {cells.map((c) => (
          <div key={c.l} className={styles.qgCell}>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={c.v}
                className={styles.qgCellV}
                initial={reduce ? false : { y: -14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduce ? undefined : { y: 14, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                {String(c.v).padStart(2, "0")}
              </motion.span>
            </AnimatePresence>
            <span className={styles.qgCellL}>{c.l}</span>
          </div>
        ))}
      </div>

      <motion.button
        className={styles.qgCta}
        animate={reduce ? undefined : { boxShadow: ["0 0 0 0 rgba(45,212,191,0.45)", "0 0 0 12px rgba(45,212,191,0)", "0 0 0 0 rgba(45,212,191,0)"] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <span className={styles.qgCtaDot} />
        Entrar na network
      </motion.button>
    </div>
  );
}

// ─── 6. CHAT — feed da comunidade ──────────────────────────────────────────
//
// Bolhas de mensagens chegando em sequência, estilo WhatsApp. Inclui typing
// indicator antes de cada nova mensagem.

const CHAT_THREAD = [
  { who: "Mariana", text: "Fechei o primeiro contrato hoje 🎉" },
  { who: "Bruno", text: "Boa! Que vertical?" },
  { who: "Mariana", text: "Restaurante, automação de reservas via WhatsApp" },
  { who: "Equipa CZ", text: "Brilhante. Posta o script no Cofre 👇" },
];

export function MockChat() {
  const reduce = useReducedMotion();
  const { step } = useLoopStep(2200, CHAT_THREAD.length + 1);

  return (
    <div className={styles.chat}>
      <div className={styles.chatHeader}>
        <span className={styles.chatTitle}>#network · Domingo 14:32</span>
        <span className={styles.chatOnline}>
          <span className={styles.chatOnlineDot} />
          3 online
        </span>
      </div>

      <ul className={styles.chatMessages}>
        {CHAT_THREAD.map((msg, i) => {
          const visible = i < step;
          return (
            <AnimatePresence key={i}>
              {visible && (
                <motion.li
                  className={`${styles.chatBubble} ${msg.who === "Equipa CZ" ? styles.chatBubbleOwn : ""}`}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className={styles.chatWho}>{msg.who}</span>
                  <span className={styles.chatText}>{msg.text}</span>
                </motion.li>
              )}
            </AnimatePresence>
          );
        })}
        {!reduce && step < CHAT_THREAD.length && (
          <motion.li
            className={styles.chatTyping}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span /><span /><span />
          </motion.li>
        )}
      </ul>
    </div>
  );
}

// ─── Export map keyed by tool slug (matches DEFAULTS.stackTools[].key) ─────

export const TOOL_MOCKS: Record<string, React.ComponentType> = {
  radar: MockRadar,
  disparador: MockDisparador,
  cofre: MockCofre,
  forja: MockForja,
  qg: MockQG,
  chat: MockChat,
};
