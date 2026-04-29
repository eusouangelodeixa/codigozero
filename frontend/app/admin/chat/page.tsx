"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Conversation {
  channel: string;
  userId: string;
  user: { id: string; name: string; email: string; subscriptionStatus: string; avatarUrl?: string } | null;
  lastMessage: { content: string; createdAt: string; sender: { name: string; role: string } } | null;
  unreadCount: number;
  totalMessages: number;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string; role: string; avatarUrl?: string };
}

type View = "support" | "community";

export default function AdminChatPage() {
  const [view, setView] = useState<View>("support");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [adminId, setAdminId] = useState("");
  const [toast, setToast] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<any>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("cz_user") || "{}");
      setAdminId(u.id || "");
    } catch {}
  }, []);

  // Load inbox
  const fetchInbox = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/chat/support/inbox`, { headers: hdr() });
      if (!res.ok) return;
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchInbox();
    const iv = setInterval(fetchInbox, 8000);
    return () => clearInterval(iv);
  }, [fetchInbox]);

  // Load messages
  const fetchMessages = useCallback(async () => {
    if (view === "support" && !selectedUserId) return;
    try {
      const endpoint = view === "community"
        ? "/api/chat/community"
        : `/api/chat/support?userId=${selectedUserId}`;
      const res = await fetch(`${API}${endpoint}`, { headers: hdr() });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {}
  }, [view, selectedUserId]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 4000);
    return () => clearInterval(pollRef.current);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    if (view === "support" && !selectedUserId) return;
    setSending(true);
    try {
      const endpoint = view === "community" ? "/api/chat/community" : "/api/chat/support";
      const body: any = { content: input };
      if (view === "support") body.userId = selectedUserId;

      const res = await fetch(`${API}${endpoint}`, {
        method: "POST", headers: hdr(), body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, data.message]);
        setInput("");
        inputRef.current?.focus();
        if (view === "support") fetchInbox();
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
        const d = await res.json().catch(() => ({}));
        showToast(d.error || "Erro");
      }
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return formatTime(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const selectedConvo = conversations.find(c => c.userId === selectedUserId);

  const statusBadge = (s: string) => {
    if (s === "active") return { cls: "badgeGreen", label: "Ativo" };
    if (s === "lead") return { cls: "badgeYellow", label: "Lead" };
    return { cls: "badgeRed", label: "Inativo" };
  };

  const showChatPanel = view === "community" || (view === "support" && selectedUserId);

  return (
    <>
      <div className={styles.pageHeader}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 className={styles.pageTitle}>💬 Chat</h1>
            <p className={styles.pageDesc}>
              {view === "support" ? "Conversas de suporte 1:1 com membros" : "Chat da comunidade — todos os membros"}
            </p>
          </div>
          <div style={{ display: "flex", gap: "4px", background: "rgba(255,255,255,0.03)", padding: "3px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={() => { setView("support"); setMessages([]); }}
              style={{
                padding: "6px 14px", fontSize: "12px", fontWeight: 500, borderRadius: "6px",
                color: view === "support" ? "#2DD4BF" : "#888",
                background: view === "support" ? "rgba(45,212,191,0.1)" : "transparent",
                transition: "all 0.15s",
              }}
            >
              🎧 Suporte 1:1
            </button>
            <button
              onClick={() => { setView("community"); setMessages([]); }}
              style={{
                padding: "6px 14px", fontSize: "12px", fontWeight: 500, borderRadius: "6px",
                color: view === "community" ? "#2DD4BF" : "#888",
                background: view === "community" ? "rgba(45,212,191,0.1)" : "transparent",
                transition: "all 0.15s",
              }}
            >
              💬 Comunidade
            </button>
          </div>
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: view === "support" ? "320px 1fr" : "1fr",
        gap: "0", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: "12px", overflow: "hidden",
        height: "calc(100vh - 180px)", minHeight: "500px",
      }}>

        {/* ── Inbox Sidebar (support only) ── */}
        {view === "support" && (
          <div style={{ background: "#0d0d12", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", fontSize: "13px", color: "#888", fontWeight: 600 }}>
              {conversations.length} Conversa{conversations.length !== 1 ? "s" : ""}
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {conversations.length === 0 && (
                <div style={{ padding: "40px 16px", textAlign: "center", color: "#555", fontSize: "13px" }}>
                  Nenhuma conversa de suporte ainda.
                </div>
              )}

              {conversations.map(convo => {
                const isSelected = convo.userId === selectedUserId;
                const badge = statusBadge(convo.user?.subscriptionStatus || "");
                return (
                  <button
                    key={convo.channel}
                    onClick={() => { setSelectedUserId(convo.userId); setMessages([]); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "12px 16px",
                      background: isSelected ? "rgba(45,212,191,0.06)" : "transparent",
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      transition: "background 0.12s",
                      display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer",
                    }}
                  >
                    <div style={{
                      width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
                      background: isSelected ? "rgba(45,212,191,0.15)" : "rgba(255,255,255,0.06)",
                      color: isSelected ? "#2DD4BF" : "#888",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "14px", fontWeight: 700, overflow: "hidden",
                    }}>
                      {convo.user?.avatarUrl
                        ? <img src={convo.user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                        : convo.user?.name?.[0]?.toUpperCase() || "?"
                      }
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: isSelected ? "#fff" : "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {convo.user?.name || "Usuário"}
                        </span>
                        {convo.unreadCount > 0 && (
                          <span style={{ background: "#2DD4BF", color: "#000", fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "10px", flexShrink: 0 }}>
                            {convo.unreadCount}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "12px", color: "#666", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {convo.lastMessage
                          ? `${convo.lastMessage.sender.role === "admin" ? "Você: " : ""}${convo.lastMessage.content}`
                          : "Sem mensagens"}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                        <span className={`${styles.badge} ${styles[badge.cls]}`} style={{ fontSize: "10px", padding: "1px 6px" }}>
                          {badge.label}
                        </span>
                        {convo.lastMessage && (
                          <span style={{ fontSize: "10px", color: "#555" }}>{formatDate(convo.lastMessage.createdAt)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Chat Panel ── */}
        <div style={{ display: "flex", flexDirection: "column", background: "#0a0a0f" }}>
          {!showChatPanel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "40px", opacity: 0.4 }}>💬</span>
              <p style={{ color: "#555", fontSize: "14px" }}>Selecione uma conversa</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              {view === "support" && selectedConvo && (
                <div style={{
                  padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", gap: "10px", flexShrink: 0,
                }}>
                  <div style={{
                    width: "32px", height: "32px", borderRadius: "50%", overflow: "hidden",
                    background: "rgba(45,212,191,0.12)", color: "#2DD4BF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "13px", fontWeight: 700,
                  }}>
                    {selectedConvo.user?.avatarUrl
                      ? <img src={selectedConvo.user.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : selectedConvo.user?.name?.[0]?.toUpperCase() || "?"
                    }
                  </div>
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff", margin: 0 }}>
                      {selectedConvo.user?.name || "Usuário"}
                    </p>
                    <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>
                      {selectedConvo.user?.email}
                    </p>
                  </div>
                </div>
              )}

              {view === "community" && (
                <div style={{
                  padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
                  flexShrink: 0,
                }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "#fff", margin: 0 }}>💬 Chat da Comunidade</p>
                  <p style={{ fontSize: "11px", color: "#888", margin: 0 }}>Todos os membros podem ver e participar</p>
                </div>
              )}

              {/* Messages */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {messages.length === 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "13px" }}>
                    {view === "community" ? "Nenhuma mensagem na comunidade ainda." : `Início da conversa com ${selectedConvo?.user?.name || "este usuário"}`}
                  </div>
                )}

                {messages.map(msg => {
                  const isMine = msg.sender.id === adminId;
                  const isAdminSender = msg.sender.role === "admin";
                  return (
                    <div key={msg.id} style={{ display: "flex", justifyContent: isMine ? "flex-end" : "flex-start", marginBottom: "2px", gap: "8px", alignItems: "flex-end" }}>
                      {!isMine && view === "community" && (
                        <div style={{
                          width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                          background: isAdminSender ? "rgba(45,212,191,0.15)" : "rgba(255,255,255,0.06)",
                          color: isAdminSender ? "#2DD4BF" : "#888",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 700,
                        }}>
                          {msg.sender.avatarUrl
                            ? <img src={msg.sender.avatarUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : msg.sender.name?.[0]?.toUpperCase() || "?"
                          }
                        </div>
                      )}
                      <div style={{
                        maxWidth: "70%", padding: "8px 14px", borderRadius: "14px",
                        background: isMine ? "rgba(45,212,191,0.12)" : "rgba(255,255,255,0.04)",
                        border: isMine ? "none" : "1px solid rgba(255,255,255,0.06)",
                        borderBottomRightRadius: isMine ? "4px" : "14px",
                        borderBottomLeftRadius: isMine ? "14px" : "4px",
                      }}>
                        {!isMine && view === "community" && (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: isAdminSender ? "#2DD4BF" : "#aaa" }}>
                              {msg.sender.name}
                            </span>
                            {isAdminSender && (
                              <span style={{
                                fontSize: "8px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                                padding: "1px 5px", borderRadius: "3px",
                                background: "rgba(45,212,191,0.12)", color: "#2DD4BF",
                                border: "1px solid rgba(45,212,191,0.2)",
                              }}>
                                Moderador
                              </span>
                            )}
                          </div>
                        )}
                        <p style={{ fontSize: "13px", color: "#ddd", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {msg.content}
                        </p>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "2px", gap: "8px" }}>
                          <span style={{ fontSize: "10px", color: "#555" }}>{formatTime(msg.createdAt)}</span>
                          <button
                            onClick={() => handleDelete(msg.id)}
                            style={{ fontSize: "11px", opacity: 0.3, cursor: "pointer", padding: "0 2px", transition: "opacity 0.15s" }}
                            onMouseOver={e => e.currentTarget.style.opacity = "0.8"}
                            onMouseOut={e => e.currentTarget.style.opacity = "0.3"}
                            title="Apagar mensagem"
                          >
                            🗑
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={{
                display: "flex", gap: "8px", padding: "12px 20px",
                borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
              }}>
                <input
                  ref={inputRef}
                  style={{
                    flex: 1, padding: "10px 16px", borderRadius: "20px",
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                    color: "#fff", fontSize: "13px", outline: "none",
                  }}
                  placeholder={view === "community" ? "Enviar para a comunidade..." : "Responder..."}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  style={{
                    width: "36px", height: "36px", borderRadius: "50%",
                    background: "#2DD4BF", color: "#000", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    opacity: !input.trim() ? 0.4 : 1, cursor: !input.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
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
    </>
  );
}
