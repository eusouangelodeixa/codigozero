"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type TouchEvent as ReactTouchEvent } from "react";
import { Tabs, useToast } from "@/components/ui";
import { ChatIcon } from "@/components/Icons";
import styles from "./chat.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🙏", "🔥", "😮"];

interface Reaction {
  emoji: string;
  userId: string;
}
interface Message {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string; role: string; avatarUrl?: string };
  replyTo?: { id: string; content: string; sender?: { id: string; name: string } } | null;
  reactions?: Reaction[];
}

type Tab = "community" | "support";

// avatarUrl is stored relative to the API host (e.g. /uploads/avatars/x.png).
// Render it against the API origin; the frontend origin would 404 → broken "?".
const avatarSrc = (url?: string) => (url ? (url.startsWith("http") ? url : `${API}${url}`) : "");
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n).trimEnd() + "…" : s);

const aggregateReactions = (reactions: Reaction[] | undefined, myId: string) => {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions || []) {
    const e = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    e.count++;
    if (r.userId === myId) e.mine = true;
    map.set(r.emoji, e);
  }
  return [...map.values()];
};

const TrashIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const ReplyIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 17 4 12 9 7" />
    <path d="M20 18v-2a4 4 0 00-4-4H4" />
  </svg>
);
const SmileIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" />
  </svg>
);
const CopyIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);
const SendIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

export default function ChatPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("community");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Whether the user is parked near the bottom. Only then do we auto-scroll on
  // new messages — otherwise polling would yank them down while reading history.
  const nearBottomRef = useRef(true);

  // Touch-gesture state (WhatsApp-style): swipe-right to reply, long-press to
  // open the action menu. suppressClickRef stops the synthetic click after a
  // gesture from also toggling the menu.
  const suppressClickRef = useRef(false);
  const gestureRef = useRef<{
    id: string; x: number; y: number; el: HTMLElement | null;
    mode: "none" | "swipe" | "scroll"; timer: ReturnType<typeof setTimeout> | null; longPressed: boolean;
  }>({ id: "", x: 0, y: 0, el: null, mode: "none", timer: null, longPressed: false });

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("cz_user") || "{}");
      setUserId(u.id || "");
      setUserRole(u.role || "");
    } catch {}
  }, []);

  const viewerIsAdmin = userRole === "admin" || userRole === "superadmin";

  const fetchMessages = useCallback(async () => {
    try {
      const endpoint = tab === "community" ? "/api/chat/community" : "/api/chat/support";
      const res = await fetch(`${API}${endpoint}`, { headers: hdr() });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {}
  }, [tab]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    if (nearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // When the on-screen keyboard opens/closes the visual viewport resizes. Keep
  // the latest message in view (if the user was at the bottom) so the layout
  // doesn't appear to jump/cut when typing a reply on mobile.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      if (nearBottomRef.current) messagesEndRef.current?.scrollIntoView({ block: "end" });
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    setMessages([]);
    setReplyingTo(null);
    setActiveMsgId(null);
    nearBottomRef.current = true;
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    nearBottomRef.current = true; // sending my own message → jump to bottom
    const endpoint = tab === "community" ? "/api/chat/community" : "/api/chat/support";
    const body: Record<string, unknown> = { content: input };
    if (replyingTo) body.replyToId = replyingTo.id;
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setInput("");
        setReplyingTo(null);
        inputRef.current?.focus();
      }
    } catch {}
    setSending(false);
  };

  const handleDelete = async (msgId: string) => {
    setActiveMsgId(null);
    if (!confirm("Deseja apagar esta mensagem?")) return;
    try {
      const res = await fetch(`${API}/api/chat/messages/${msgId}`, { method: "DELETE", headers: hdr() });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
        toast.success("Mensagem apagada");
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error("Falha ao apagar", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
  };

  const toggleReaction = async (msgId: string, emoji: string) => {
    setActiveMsgId(null);
    // Optimistic: flip the viewer's reaction locally, then persist.
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        const reactions = [...(m.reactions || [])];
        const idx = reactions.findIndex((r) => r.emoji === emoji && r.userId === userId);
        if (idx >= 0) reactions.splice(idx, 1);
        else reactions.push({ emoji, userId });
        return { ...m, reactions };
      })
    );
    try {
      await fetch(`${API}/api/chat/messages/${msgId}/react`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ emoji }),
      });
    } catch {}
  };

  const startReply = (msg: Message) => {
    setReplyingTo(msg);
    setActiveMsgId(null);
    inputRef.current?.focus();
  };

  const copyMessage = async (msg: Message) => {
    setActiveMsgId(null);
    try {
      await navigator.clipboard.writeText(msg.content);
      toast.success("Mensagem copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  // ── WhatsApp-style touch gestures ──
  const SWIPE_TRIGGER = 56; // px to drag before a reply fires
  const onMsgTouchStart = (e: ReactTouchEvent<HTMLDivElement>, msg: Message) => {
    const t = e.touches[0];
    suppressClickRef.current = false;
    const g = gestureRef.current;
    g.id = msg.id; g.x = t.clientX; g.y = t.clientY; g.el = e.currentTarget;
    g.mode = "none"; g.longPressed = false;
    if (g.timer) clearTimeout(g.timer);
    g.timer = setTimeout(() => {
      g.longPressed = true;
      suppressClickRef.current = true;
      setActiveMsgId(msg.id);
      try { navigator.vibrate?.(15); } catch {}
    }, 430);
  };
  const onMsgTouchMove = (e: ReactTouchEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g.el) return;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (g.mode === "none") {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g.mode = "scroll"; if (g.timer) clearTimeout(g.timer); return; }
      if (Math.abs(dx) > 8) { g.mode = "swipe"; if (g.timer) clearTimeout(g.timer); }
    }
    if (g.mode === "swipe") {
      const off = Math.max(0, Math.min(dx, 84)); // only swipe-right replies
      g.el.style.transition = "none";
      g.el.style.transform = `translateX(${off}px)`;
      const ind = g.el.parentElement?.querySelector("[data-reply-ind]") as HTMLElement | null;
      if (ind) ind.style.opacity = String(Math.min(off / SWIPE_TRIGGER, 1));
    }
  };
  const onMsgTouchEnd = (e: ReactTouchEvent<HTMLDivElement>, msg: Message) => {
    const g = gestureRef.current;
    if (g.timer) clearTimeout(g.timer);
    if (g.mode === "swipe" && g.el) {
      const dx = (e.changedTouches[0]?.clientX ?? g.x) - g.x;
      const el = g.el;
      el.style.transition = "transform 180ms cubic-bezier(0.16,1,0.3,1)";
      el.style.transform = "translateX(0)";
      const ind = el.parentElement?.querySelector("[data-reply-ind]") as HTMLElement | null;
      if (ind) ind.style.opacity = "0";
      if (dx > SWIPE_TRIGGER) { startReply(msg); try { navigator.vibrate?.(10); } catch {} }
      suppressClickRef.current = true;
    } else {
      // long-press (menu already open) or plain tap — either way, don't let the
      // synthetic click toggle the menu on touch. Opening is long-press only.
      suppressClickRef.current = true;
    }
    g.el = null; g.mode = "none";
  };

  const canDelete = (msg: Message) => {
    if (viewerIsAdmin) return true;
    if (msg.sender.id !== userId) return false;
    return Date.now() - new Date(msg.createdAt).getTime() < 15 * 60 * 1000;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Hoje";
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  const grouped: { date: string; msgs: Message[] }[] = [];
  let lastDate = "";
  messages.forEach((msg) => {
    const date = formatDate(msg.createdAt);
    if (date !== lastDate) {
      grouped.push({ date, msgs: [msg] });
      lastDate = date;
    } else {
      grouped[grouped.length - 1].msgs.push(msg);
    }
  });

  const headerSubtitle =
    tab === "community"
      ? "Converse com outros membros do Código Zero"
      : "Chat privado com o mentor — tire suas dúvidas";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.title}>{tab === "community" ? "Comunidade" : "Suporte"}</span>
          <span className={styles.subtitle}>{headerSubtitle}</span>
        </div>
        <Tabs
          value={tab}
          onChange={(v) => switchTab(v)}
          items={[
            { value: "community", label: "Comunidade" },
            { value: "support", label: "Suporte" },
          ]}
        />
      </header>

      <div className={styles.messagesContainer} ref={containerRef} onScroll={onScroll} onClick={() => setActiveMsgId(null)}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><ChatIcon size={24} /></span>
            <span className={styles.emptyTitle}>
              {tab === "community" ? "Seja o primeiro a falar" : "Precisa de ajuda?"}
            </span>
            <span className={styles.emptyDesc}>
              {tab === "community"
                ? "A comunidade está esperando. Envie uma mensagem para começar."
                : "Envie uma mensagem e o mentor responderá em breve."}
            </span>
          </div>
        )}

        {grouped.map((group, gi) => (
          <div key={gi}>
            <div className={styles.dateDivider}><span>{group.date}</span></div>
            {group.msgs.map((msg) => {
              const isMine = msg.sender.id === userId;
              const isAdmin = msg.sender.role === "admin" || msg.sender.role === "superadmin";
              const reactions = aggregateReactions(msg.reactions, userId);
              const active = activeMsgId === msg.id;
              return (
                <div key={msg.id} className={cx(styles.message, isMine ? styles.messageMine : styles.messageOther)}>
                  {!isMine && (
                    <div className={cx(styles.avatar, isAdmin && styles.avatarAdmin)}>
                      <span className={styles.avatarInitial}>{msg.sender.name?.[0]?.toUpperCase() || "?"}</span>
                      {msg.sender.avatarUrl && (
                        <img
                          src={avatarSrc(msg.sender.avatarUrl)}
                          alt=""
                          className={styles.avatarImg}
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>
                  )}

                  <div className={styles.bubbleWrap}>
                    <span className={styles.swipeIndicator} data-reply-ind aria-hidden><ReplyIcon size={16} /></span>
                    {active && (
                      <div className={cx(styles.actionBar, isMine ? styles.actionBarMine : styles.actionBarOther)} onClick={(e) => e.stopPropagation()}>
                        {REACTION_EMOJIS.map((em) => (
                          <button key={em} type="button" className={styles.reactPick} onClick={() => toggleReaction(msg.id, em)} aria-label={`Reagir ${em}`}>
                            {em}
                          </button>
                        ))}
                        <span className={styles.actionDivider} />
                        <button type="button" className={styles.actionBtn} onClick={() => startReply(msg)} title="Responder" aria-label="Responder">
                          <ReplyIcon />
                        </button>
                        <button type="button" className={styles.actionBtn} onClick={() => copyMessage(msg)} title="Copiar" aria-label="Copiar">
                          <CopyIcon />
                        </button>
                        {canDelete(msg) && (
                          <button type="button" className={cx(styles.actionBtn, styles.actionBtnDanger)} onClick={() => handleDelete(msg.id)} title="Apagar" aria-label="Apagar">
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    )}

                    <div
                      className={cx(styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther, isAdmin && !isMine && styles.bubbleAdmin)}
                      onTouchStart={(e) => onMsgTouchStart(e, msg)}
                      onTouchMove={onMsgTouchMove}
                      onTouchEnd={(e) => onMsgTouchEnd(e, msg)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                        setActiveMsgId(active ? null : msg.id);
                      }}
                    >
                      {!isMine && (
                        <div className={styles.senderRow}>
                          <span className={cx(styles.senderName, isAdmin && styles.senderAdmin)}>{msg.sender.name}</span>
                          {isAdmin && <span className={styles.modBadge}>Moderador</span>}
                        </div>
                      )}

                      {msg.replyTo && (
                        <div className={styles.replyQuote}>
                          <span className={styles.replyQuoteName}>{msg.replyTo.sender?.name || "Mensagem"}</span>
                          <span className={styles.replyQuoteText}>{truncate(msg.replyTo.content, 120)}</span>
                        </div>
                      )}

                      <p className={styles.bubbleText}>{msg.content}</p>
                      <div className={styles.bubbleFooter}>
                        <span className={styles.bubbleTime}>{formatTime(msg.createdAt)}</span>
                        <button
                          type="button"
                          className={styles.reactCue}
                          onClick={(e) => { e.stopPropagation(); setActiveMsgId(active ? null : msg.id); }}
                          aria-label="Reagir ou responder"
                          title="Reagir / responder"
                        >
                          <SmileIcon size={14} />
                        </button>
                      </div>
                    </div>

                    {reactions.length > 0 && (
                      <div className={cx(styles.reactions, isMine && styles.reactionsMine)}>
                        {reactions.map((r) => (
                          <button
                            key={r.emoji}
                            type="button"
                            className={cx(styles.reactionChip, r.mine && styles.reactionChipMine)}
                            onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, r.emoji); }}
                          >
                            <span>{r.emoji}</span>
                            <span className={styles.reactionCount}>{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.composer}>
        {replyingTo && (
          <div className={styles.replyBar}>
            <span className={styles.replyBarAccent} />
            <div className={styles.replyBarBody}>
              <span className={styles.replyBarName}>Respondendo a {replyingTo.sender.name}</span>
              <span className={styles.replyBarText}>{truncate(replyingTo.content, 90)}</span>
            </div>
            <button type="button" className={styles.replyBarClose} onClick={() => setReplyingTo(null)} aria-label="Cancelar resposta">✕</button>
          </div>
        )}
        <div className={styles.inputBar}>
          <input
            ref={inputRef}
            className={styles.inputField}
            placeholder={
              tab === "community"
                ? "Envie uma mensagem para a comunidade…"
                : "Envie uma mensagem para o mentor…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
          />
          <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || sending} aria-label="Enviar">
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
