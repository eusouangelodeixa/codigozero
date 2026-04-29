"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./chat.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Message {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string; role: string; avatarUrl?: string };
}

type Tab = "community" | "support";

export default function ChatPage() {
  const [tab, setTab] = useState<Tab>("community");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState("");
  const [toast, setToast] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<any>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("cz_user") || "{}");
      setUserId(u.id || "");
    } catch {}
  }, []);

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
    return () => clearInterval(pollRef.current);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const switchTab = (t: Tab) => { setTab(t); setMessages([]); };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    const endpoint = tab === "community" ? "/api/chat/community" : "/api/chat/support";
    try {
      const res = await fetch(`${API}${endpoint}`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ content: input }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
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
        method: "DELETE", headers: hdr(),
      });
      if (res.ok) {
        setMessages(prev => prev.filter(m => m.id !== msgId));
        showToast("Mensagem apagada");
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || "Erro ao apagar");
      }
    } catch {
      showToast("Erro de conexão");
    }
  };

  const canDelete = (msg: Message) => {
    if (msg.sender.id !== userId) return false;
    const ageMs = Date.now() - new Date(msg.createdAt).getTime();
    return ageMs < 15 * 60 * 1000;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Hoje";
    const y = new Date(today); y.setDate(today.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  // Group messages by date
  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  let lastDate = "";
  messages.forEach(msg => {
    const date = formatDate(msg.createdAt);
    if (date !== lastDate) {
      groupedMessages.push({ date, msgs: [msg] });
      lastDate = date;
    } else {
      groupedMessages[groupedMessages.length - 1].msgs.push(msg);
    }
  });

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>
            {tab === "community" ? "💬 Chat da Comunidade" : "🎧 Suporte ao Mentor"}
          </h1>
          <p className={styles.subtitle}>
            {tab === "community"
              ? "Converse com outros membros do Código Zero"
              : "Chat privado com o mentor — tire suas dúvidas"}
          </p>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "community" ? styles.tabActive : ""}`}
            onClick={() => switchTab("community")}
          >
            💬 Comunidade
          </button>
          <button
            className={`${styles.tab} ${tab === "support" ? styles.tabActive : ""}`}
            onClick={() => switchTab("support")}
          >
            🎧 Suporte
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messagesContainer}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>{tab === "community" ? "💬" : "🎧"}</div>
            <p className={styles.emptyTitle}>
              {tab === "community" ? "Seja o primeiro a falar!" : "Precisa de ajuda?"}
            </p>
            <p className={styles.emptyDesc}>
              {tab === "community"
                ? "A comunidade está esperando por você. Envie uma mensagem!"
                : "Envie uma mensagem e o mentor responderá em breve."}
            </p>
          </div>
        )}

        {groupedMessages.map((group, gi) => (
          <div key={gi}>
            <div className={styles.dateDivider}><span>{group.date}</span></div>
            {group.msgs.map(msg => {
              const isMine = msg.sender.id === userId;
              const isAdmin = msg.sender.role === "admin";
              return (
                <div
                  key={msg.id}
                  className={`${styles.message} ${isMine ? styles.messageMine : styles.messageOther}`}
                >
                  {!isMine && (
                    <div className={`${styles.avatar} ${isAdmin ? styles.avatarAdmin : ""}`}>
                      {msg.sender.avatarUrl ? (
                        <img src={msg.sender.avatarUrl} alt="" className={styles.avatarImg} />
                      ) : (
                        msg.sender.name?.[0]?.toUpperCase() || "?"
                      )}
                    </div>
                  )}
                  <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleOther} ${isAdmin && !isMine ? styles.bubbleAdmin : ""}`}>
                    {!isMine && (
                      <div className={styles.senderRow}>
                        <span className={`${styles.senderName} ${isAdmin ? styles.senderAdmin : ""}`}>
                          {msg.sender.name}
                        </span>
                        {isAdmin && <span className={styles.modBadge}>Moderador</span>}
                      </div>
                    )}
                    <p className={styles.bubbleText}>{msg.content}</p>
                    <div className={styles.bubbleFooter}>
                      <span className={styles.bubbleTime}>{formatTime(msg.createdAt)}</span>
                      {isMine && canDelete(msg) && (
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(msg.id)}
                          title="Apagar mensagem"
                        >
                          🗑
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

      {/* Input */}
      <div className={styles.inputBar}>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder={tab === "community" ? "Envie uma mensagem para a comunidade..." : "Envie uma mensagem para o mentor..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={2000}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim() || sending}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          padding: "10px 18px", borderRadius: 8,
          background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.25)",
          color: "#2DD4BF", fontSize: 13,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
