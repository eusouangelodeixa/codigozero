"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Tabs, useToast } from "@/components/ui";
import { ChatIcon } from "@/components/Icons";
import styles from "./chat.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({
  Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  "Content-Type": "application/json",
});

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

interface Message {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string; role: string; avatarUrl?: string };
}

type Tab = "community" | "support";

const TrashIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 13} height={p.size ?? 13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const SendIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 18} height={p.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setMessages([]);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const endpoint = tab === "community" ? "/api/chat/community" : "/api/chat/support";
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ content: input }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [...prev, data.message]);
        setInput("");
        inputRef.current?.focus();
      }
    } catch {}
    setSending(false);
  };

  const handleDelete = async (msgId: string) => {
    if (!confirm("Deseja apagar esta mensagem?")) return;
    try {
      const res = await fetch(`${API}/api/chat/messages/${msgId}`, {
        method: "DELETE",
        headers: hdr(),
      });
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

  const canDelete = (msg: Message) => {
    // Admins/superadmins can delete any message regardless of age.
    if (viewerIsAdmin) return true;
    // Owners only within a 15-minute window.
    if (msg.sender.id !== userId) return false;
    const ageMs = Date.now() - new Date(msg.createdAt).getTime();
    return ageMs < 15 * 60 * 1000;
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
            { value: "support",   label: "Suporte" },
          ]}
        />
      </header>

      <div className={styles.messagesContainer}>
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
              return (
                <div
                  key={msg.id}
                  className={cx(styles.message, isMine ? styles.messageMine : styles.messageOther)}
                >
                  {!isMine && (
                    <div className={cx(styles.avatar, isAdmin && styles.avatarAdmin)}>
                      {msg.sender.avatarUrl ? (
                        <img src={msg.sender.avatarUrl} alt="" />
                      ) : (
                        msg.sender.name?.[0]?.toUpperCase() || "?"
                      )}
                    </div>
                  )}
                  <div
                    className={cx(
                      styles.bubble,
                      isMine ? styles.bubbleMine : styles.bubbleOther,
                      isAdmin && !isMine && styles.bubbleAdmin
                    )}
                  >
                    {!isMine && (
                      <div className={styles.senderRow}>
                        <span className={cx(styles.senderName, isAdmin && styles.senderAdmin)}>
                          {msg.sender.name}
                        </span>
                        {isAdmin && <span className={styles.modBadge}>Moderador</span>}
                      </div>
                    )}
                    <p className={styles.bubbleText}>{msg.content}</p>
                    <div className={styles.bubbleFooter}>
                      <span className={styles.bubbleTime}>{formatTime(msg.createdAt)}</span>
                      {canDelete(msg) && (
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(msg.id)}
                          aria-label={isMine ? "Apagar" : "Moderar e apagar"}
                          title={isMine ? "Apagar" : "Moderar (apagar mensagem)"}
                        >
                          <TrashIcon />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

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
        <button
          type="button"
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || sending}
          aria-label="Enviar"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}
