"use client";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type TouchEvent as ReactTouchEvent } from "react";
import { Tabs, useToast } from "@/components/ui";
import { ChatIcon } from "@/components/Icons";
import styles from "./chat.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const token = () => localStorage.getItem("cz_token");
const hdr = () => ({
  Authorization: `Bearer ${token()}`,
  "Content-Type": "application/json",
});

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const REACTION_EMOJIS = ["👍", "❤️", "😂", "🙏", "🔥", "😮"];
const PIN_OPTIONS: { label: string; value: string }[] = [
  { label: "1 hora", value: "1h" },
  { label: "1 dia", value: "1d" },
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
];

interface Reaction { emoji: string; userId: string; }
interface Mention { userId: string; name: string; }
interface PollOption { id: string; text: string; order: number; count: number; }
interface Poll {
  id: string;
  question: string;
  allowMultiple: boolean;
  expiresAt: string | null;
  totalVoters: number;
  options: PollOption[];
  myVotes: string[];
}
interface Member { id: string; name: string; avatarUrl?: string; role: string; }
interface Message {
  id: string;
  content: string;
  createdAt: string;
  type?: "text" | "image" | "audio" | "poll";
  mediaUrl?: string | null;
  mediaMime?: string | null;
  mediaDurationSec?: number | null;
  mentionsAll?: boolean;
  mentions?: Mention[];
  pinnedUntil?: string | null;
  pinnedBy?: { id: string; name: string } | null;
  poll?: Poll | null;
  sender: { id: string; name: string; role: string; avatarUrl?: string };
  replyTo?: { id: string; content: string; type?: string; sender?: { id: string; name: string } } | null;
  reactions?: Reaction[];
}

type Tab = "community" | "support";

const avatarSrc = (url?: string) => (url ? (url.startsWith("http") ? url : `${API}${url}`) : "");
const mediaSrc = (url?: string | null) => (url ? (url.startsWith("http") ? url : `${API}${url}`) : "");
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

const fmtDuration = (sec?: number | null) => {
  const s = Math.max(0, Math.round(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TrashIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);
const ReplyIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 00-4-4H4" />
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
const PinIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 15} height={p.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14l-1.5-4V6a2 2 0 00-2-2h-7a2 2 0 00-2 2v7L5 17z" />
  </svg>
);
const ImageIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 19} height={p.size ?? 19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);
const MicIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 19} height={p.size ?? 19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
  </svg>
);
const PollIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 19} height={p.size ?? 19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="20" x2="6" y2="12" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" />
  </svg>
);
const CheckIcon = (p: { size?: number }) => (
  <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);

export default function ChatPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("community");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinned, setPinned] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState("");
  const [userRole, setUserRole] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeMsgId, setActiveMsgId] = useState<string | null>(null);
  const [pinPickerId, setPinPickerId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // composer extras
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const [pollOpen, setPollOpen] = useState(false);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<Member[]>([]);
  const selectedMentionsRef = useRef<Map<string, string>>(new Map()); // name → userId

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nearBottomRef = useRef(true);

  // audio recording
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<BlobPart[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recSecondsRef = useRef(0);
  const recCancelledRef = useRef(false);

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

  // Apply an authoritative snapshot (from SSE SYNC or the GET fallback) while
  // preserving any local optimistic message the server window hasn't caught up
  // to yet. The server copy wins for anything it knows about (reactions, votes,
  // pins, deletes all ride along), so this matches the old full-replace poll but
  // never drops a just-sent message during the commit→next-tick gap.
  const applySync = useCallback((incoming: Message[], nextPinned: Message[]) => {
    setMessages((prev) => {
      const serverIds = new Set(incoming.map((m) => m.id));
      const oldest = incoming.length ? new Date(incoming[0].createdAt).getTime() : 0;
      // Keep only local-only messages newer than the server window's start, so
      // we don't resurrect messages the server dropped (deleted/paged out).
      const localExtras = prev.filter(
        (m) => !serverIds.has(m.id) && new Date(m.createdAt).getTime() >= oldest,
      );
      const merged = [...incoming, ...localExtras];
      merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return merged;
    });
    setPinned(nextPinned);
  }, []);

  const fetchMessages = useCallback(async () => {
    try {
      const endpoint = tab === "community" ? "/api/chat/community" : "/api/chat/support";
      const res = await fetch(`${API}${endpoint}`, { headers: hdr() });
      if (!res.ok) return;
      const data = await res.json();
      applySync(data.messages || [], tab === "community" ? data.pinned || [] : []);
    } catch {}
  }, [tab, applySync]);

  // ── Live updates via SSE, with a polling fallback ──
  // Replaces the old 4s poll. We subscribe to the server stream for the active
  // tab; if EventSource errors/closes (common on mobile carrier NAT), we fall
  // back to the existing GET poll and keep trying to reconnect the stream.
  useEffect(() => {
    // Fast initial paint (also primes support read-receipts via GET /support).
    fetchMessages();

    let cancelled = false;

    const stopPoll = () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
    const startPoll = () => {
      if (pollRef.current) return;
      pollRef.current = setInterval(fetchMessages, 4000);
    };
    const closeStream = () => {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };

    const connect = () => {
      if (cancelled) return;
      closeStream();
      const params = new URLSearchParams({ channel: tab, token: token() || "" });
      const es = new EventSource(`${API}/api/chat/stream?${params.toString()}`);
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "SYNC") {
            // Stream is healthy → drop the fallback poll while it stays up.
            stopPoll();
            applySync(data.messages || [], tab === "community" ? data.pinned || [] : []);
          }
        } catch {}
      };

      es.onerror = () => {
        // Connection dropped. Fall back to polling immediately so the user keeps
        // getting updates, then retry the stream after a short backoff.
        closeStream();
        startPoll();
        if (!cancelled && !reconnectRef.current) {
          reconnectRef.current = setTimeout(() => {
            reconnectRef.current = null;
            connect();
          }, 5000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      closeStream();
      stopPoll();
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    };
  }, [fetchMessages, applySync, tab]);

  useEffect(() => {
    if (nearBottomRef.current) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => { if (nearBottomRef.current) messagesEndRef.current?.scrollIntoView({ block: "end" }); };
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
    setPinned([]);
    setReplyingTo(null);
    setActiveMsgId(null);
    setAttachOpen(false);
    setMentionQuery(null);
    nearBottomRef.current = true;
  };

  // ── Generic send (text / media / poll). Returns true on success. ──
  const sendPayload = async (payload: Record<string, unknown>) => {
    const endpoint = tab === "community" ? "/api/chat/community" : "/api/chat/support";
    nearBottomRef.current = true;
    const body: Record<string, unknown> = { ...payload };
    if (replyingTo) body.replyToId = replyingTo.id;
    try {
      const res = await fetch(`${API}${endpoint}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
      if (res.ok) {
        const data = await res.json();
        if (data.message) setMessages((prev) => [...prev, data.message]);
        setReplyingTo(null);
        return true;
      }
      const d = await res.json().catch(() => ({}));
      toast.error("Falha ao enviar", d.error);
    } catch {
      toast.error("Erro de conexão");
    }
    return false;
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    // mentions still present in the final text
    const mentionUserIds: string[] = [];
    selectedMentionsRef.current.forEach((id, name) => {
      if (input.includes(`@${name}`)) mentionUserIds.push(id);
    });
    const mentionsAll = viewerIsAdmin && /(^|\s)@todos\b/i.test(input);
    const ok = await sendPayload({
      content: input,
      ...(tab === "community" ? { mentionUserIds, mentionsAll } : {}),
    });
    if (ok) {
      setInput("");
      setMentionQuery(null);
      selectedMentionsRef.current.clear();
      inputRef.current?.focus();
    }
    setSending(false);
  };

  // ── Media upload (image/audio) → returns the stored URL ──
  const uploadMedia = async (file: Blob, filename: string) => {
    const fd = new FormData();
    fd.append("file", file, filename);
    try {
      const res = await fetch(`${API}/api/chat/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}` },
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("Falha no upload", d.error);
        return null;
      }
      return (await res.json()) as { url: string; mime: string; type: string };
    } catch {
      toast.error("Erro de conexão no upload");
      return null;
    }
  };

  const onPickImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setAttachOpen(false);
    if (!file) return;
    setUploading(true);
    const up = await uploadMedia(file, file.name);
    if (up) {
      await sendPayload({ type: "image", mediaUrl: up.url, mediaMime: up.mime, content: input.trim() });
      setInput("");
    }
    setUploading(false);
  };

  // ── Audio recording ──
  const startRecording = async () => {
    setAttachOpen(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunksRef.current = [];
      recCancelledRef.current = false;
      recSecondsRef.current = 0;
      setRecSeconds(0);
      mr.ondataavailable = (ev) => { if (ev.data.size) recChunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = mr.mimeType || "audio/webm";
        const blob = new Blob(recChunksRef.current, { type: mime });
        const secs = recSecondsRef.current;
        if (recCancelledRef.current || blob.size === 0) return;
        setUploading(true);
        const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
        const up = await uploadMedia(blob, `audio-${Date.now()}.${ext}`);
        if (up) await sendPayload({ type: "audio", mediaUrl: up.url, mediaMime: up.mime, mediaDurationSec: secs });
        setUploading(false);
      };
      mediaRecorderRef.current = mr;
      mr.start();
      setRecording(true);
      recTimerRef.current = setInterval(() => {
        recSecondsRef.current += 1;
        setRecSeconds(recSecondsRef.current);
        if (recSecondsRef.current >= 300) stopRecording(); // 5 min cap
      }, 1000);
    } catch {
      toast.error("Microfone indisponível", "Permita o acesso ao microfone");
    }
  };
  const stopRecording = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);
    try { mediaRecorderRef.current?.stop(); } catch {}
  };
  const cancelRecording = () => { recCancelledRef.current = true; stopRecording(); };

  // ── Poll voting (optimistic) ──
  const applyVoteLocally = (poll: Poll, next: string[]): Poll => {
    const wasVoter = poll.myVotes.length > 0;
    const willVote = next.length > 0;
    const options = poll.options.map((o) => {
      const had = poll.myVotes.includes(o.id);
      const has = next.includes(o.id);
      return { ...o, count: o.count + (has ? 1 : 0) - (had ? 1 : 0) };
    });
    return { ...poll, options, myVotes: next, totalVoters: poll.totalVoters + (willVote ? 1 : 0) - (wasVoter ? 1 : 0) };
  };

  const votePoll = async (msg: Message, optionId: string) => {
    const poll = msg.poll;
    if (!poll) return;
    if (poll.expiresAt && new Date(poll.expiresAt).getTime() < Date.now()) {
      toast.error("Enquete encerrada");
      return;
    }
    let next: string[];
    if (poll.allowMultiple) {
      next = poll.myVotes.includes(optionId) ? poll.myVotes.filter((x) => x !== optionId) : [...poll.myVotes, optionId];
    } else {
      next = poll.myVotes.includes(optionId) ? [] : [optionId];
    }
    setMessages((prev) => prev.map((m) => (m.id === msg.id && m.poll ? { ...m, poll: applyVoteLocally(m.poll, next) } : m)));
    try {
      const res = await fetch(`${API}/api/chat/polls/${poll.id}/vote`, { method: "POST", headers: hdr(), body: JSON.stringify({ optionIds: next }) });
      if (res.ok) {
        const d = await res.json();
        if (d.message) setMessages((prev) => prev.map((m) => (m.id === d.message.id ? d.message : m)));
      }
    } catch {}
  };

  // ── Pin / unpin (admin) ──
  const pinMessage = async (msgId: string, duration: string) => {
    setActiveMsgId(null);
    setPinPickerId(null);
    try {
      const res = await fetch(`${API}/api/chat/messages/${msgId}/pin`, { method: "POST", headers: hdr(), body: JSON.stringify({ duration }) });
      if (res.ok) { toast.success("Mensagem fixada"); fetchMessages(); }
      else { const d = await res.json().catch(() => ({})); toast.error("Falha ao fixar", d.error); }
    } catch { toast.error("Erro de conexão"); }
  };
  const unpinMessage = async (msgId: string) => {
    try {
      const res = await fetch(`${API}/api/chat/messages/${msgId}/pin`, { method: "DELETE", headers: hdr() });
      if (res.ok) { toast.success("Mensagem desafixada"); fetchMessages(); }
    } catch { toast.error("Erro de conexão"); }
  };

  const handleDelete = async (msgId: string) => {
    setActiveMsgId(null);
    if (!confirm("Deseja apagar esta mensagem?")) return;
    try {
      const res = await fetch(`${API}/api/chat/messages/${msgId}`, { method: "DELETE", headers: hdr() });
      if (res.ok) { setMessages((prev) => prev.filter((m) => m.id !== msgId)); setPinned((prev) => prev.filter((m) => m.id !== msgId)); toast.success("Mensagem apagada"); }
      else { const data = await res.json().catch(() => ({})); toast.error("Falha ao apagar", data.error); }
    } catch { toast.error("Erro de conexão"); }
  };

  const toggleReaction = async (msgId: string, emoji: string) => {
    setActiveMsgId(null);
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
      await fetch(`${API}/api/chat/messages/${msgId}/react`, { method: "POST", headers: hdr(), body: JSON.stringify({ emoji }) });
    } catch {}
  };

  const startReply = (msg: Message) => { setReplyingTo(msg); setActiveMsgId(null); inputRef.current?.focus(); };

  const copyMessage = async (msg: Message) => {
    setActiveMsgId(null);
    try { await navigator.clipboard.writeText(msg.content); toast.success("Mensagem copiada"); }
    catch { toast.error("Não foi possível copiar"); }
  };

  // ── @mention autocomplete ──
  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    if (tab !== "community") { setMentionQuery(null); return; }
    const caret = e.target.selectionStart ?? value.length;
    const m = value.slice(0, caret).match(/(^|\s)@(\S*)$/);
    setMentionQuery(m ? m[2] : null);
  };

  useEffect(() => {
    if (mentionQuery === null) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch(`${API}/api/chat/members?q=${encodeURIComponent(mentionQuery)}`, { headers: hdr() });
        if (!res.ok) return;
        const d = await res.json();
        if (!cancelled) setMentionResults((d.members || []).filter((u: Member) => u.id !== userId));
      } catch {}
    };
    run();
    return () => { cancelled = true; };
  }, [mentionQuery, userId]);

  const insertMention = (name: string, id?: string) => {
    const el = inputRef.current;
    const caret = el?.selectionStart ?? input.length;
    const before = input.slice(0, caret).replace(/(^|\s)@(\S*)$/, (_full, pre) => `${pre}@${name} `);
    const after = input.slice(caret);
    setInput(before + after);
    if (id) selectedMentionsRef.current.set(name, id);
    setMentionQuery(null);
    requestAnimationFrame(() => el?.focus());
  };

  // ── WhatsApp-style touch gestures ──
  const SWIPE_TRIGGER = 56;
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
      const off = Math.max(0, Math.min(dx, 84));
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

  // Highlight @mentions and @todos inside text.
  const renderBody = (text: string, mentions?: Mention[], mentionsAll?: boolean) => {
    const tags: string[] = [];
    if (mentionsAll) tags.push("@todos");
    for (const m of mentions || []) if (m.name) tags.push(`@${m.name}`);
    if (!tags.length) return text;
    const re = new RegExp(`(${tags.sort((a, b) => b.length - a.length).map(escapeRe).join("|")})`, "g");
    return text.split(re).map((p, i) => (tags.includes(p) ? <span key={i} className={styles.mentionTag}>{p}</span> : p));
  };

  const renderMessageBody = (msg: Message) => {
    if (msg.type === "image" && msg.mediaUrl) {
      return (
        <>
          <img src={mediaSrc(msg.mediaUrl)} alt={msg.content || "imagem"} className={styles.msgImage} loading="lazy" onClick={(e) => { e.stopPropagation(); setLightbox(mediaSrc(msg.mediaUrl)); }} />
          {msg.content && <p className={styles.bubbleText}>{renderBody(msg.content, msg.mentions, msg.mentionsAll)}</p>}
        </>
      );
    }
    if (msg.type === "audio" && msg.mediaUrl) {
      return (
        <div className={styles.audioWrap} onClick={(e) => e.stopPropagation()}>
          <audio controls preload="none" src={mediaSrc(msg.mediaUrl)} className={styles.audioEl} />
          {!!msg.mediaDurationSec && <span className={styles.audioDuration}>{fmtDuration(msg.mediaDurationSec)}</span>}
        </div>
      );
    }
    if (msg.type === "poll" && msg.poll) return renderPoll(msg);
    return <p className={styles.bubbleText}>{renderBody(msg.content, msg.mentions, msg.mentionsAll)}</p>;
  };

  const renderPoll = (msg: Message) => {
    const poll = msg.poll!;
    const total = poll.options.reduce((s, o) => s + o.count, 0);
    const closed = !!poll.expiresAt && new Date(poll.expiresAt).getTime() < Date.now();
    return (
      <div className={styles.pollCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.pollQuestion}>{poll.question}</div>
        <div className={styles.pollOptions}>
          {poll.options.map((o) => {
            const pct = total > 0 ? Math.round((o.count / total) * 100) : 0;
            const mine = poll.myVotes.includes(o.id);
            return (
              <button key={o.id} type="button" className={cx(styles.pollOption, mine && styles.pollOptionChosen)} onClick={() => !closed && votePoll(msg, o.id)} disabled={closed}>
                <span className={styles.pollBar} style={{ width: `${pct}%` }} />
                <span className={styles.pollOptionLabel}>
                  <span className={cx(styles.pollRadio, mine && styles.pollRadioOn)}>{mine && <CheckIcon size={11} />}</span>
                  <span className={styles.pollOptionText}>{o.text}</span>
                </span>
                <span className={styles.pollPct}>{pct}%</span>
              </button>
            );
          })}
        </div>
        <div className={styles.pollMeta}>
          <span>{poll.totalVoters} {poll.totalVoters === 1 ? "voto" : "votos"}{poll.allowMultiple ? " · múltipla escolha" : ""}</span>
          {poll.expiresAt && <span>{closed ? "Encerrada" : `Encerra ${formatDate(poll.expiresAt)} ${formatTime(poll.expiresAt)}`}</span>}
        </div>
      </div>
    );
  };

  const grouped: { date: string; msgs: Message[] }[] = [];
  let lastDate = "";
  messages.forEach((msg) => {
    const date = formatDate(msg.createdAt);
    if (date !== lastDate) { grouped.push({ date, msgs: [msg] }); lastDate = date; }
    else grouped[grouped.length - 1].msgs.push(msg);
  });

  const headerSubtitle = tab === "community"
    ? "Converse com outros membros do Código Zero"
    : "Chat privado com o mentor — tire suas dúvidas";

  const showMentionBox = mentionQuery !== null && tab === "community";
  const mentionAllMatches = viewerIsAdmin && "todos".startsWith((mentionQuery || "").toLowerCase());

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.title}>{tab === "community" ? "Comunidade" : "Suporte"}</span>
          <span className={styles.subtitle}>{headerSubtitle}</span>
        </div>
        <Tabs value={tab} onChange={(v) => switchTab(v as Tab)} items={[{ value: "community", label: "Comunidade" }, { value: "support", label: "Suporte" }]} />
      </header>

      {tab === "community" && pinned.length > 0 && (
        <div className={styles.pinnedBanner}>
          <span className={styles.pinnedIcon}><PinIcon size={14} /></span>
          <div className={styles.pinnedBody}>
            <span className={styles.pinnedLabel}>
              Fixado{pinned.length > 1 ? ` · ${pinned.length}` : ""} · {pinned[0].sender.name}
            </span>
            <span className={styles.pinnedText}>
              {pinned[0].type === "image" ? "📷 Imagem" : pinned[0].type === "audio" ? "🎤 Áudio" : pinned[0].type === "poll" ? `📊 ${pinned[0].poll?.question || "Enquete"}` : truncate(pinned[0].content, 110)}
            </span>
          </div>
          {viewerIsAdmin && (
            <button type="button" className={styles.pinnedUnpin} onClick={() => unpinMessage(pinned[0].id)} aria-label="Desafixar" title="Desafixar">✕</button>
          )}
        </div>
      )}

      <div className={styles.messagesContainer} ref={containerRef} onScroll={onScroll} onClick={() => { setActiveMsgId(null); setPinPickerId(null); setAttachOpen(false); }}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}><ChatIcon size={24} /></span>
            <span className={styles.emptyTitle}>{tab === "community" ? "Seja o primeiro a falar" : "Precisa de ajuda?"}</span>
            <span className={styles.emptyDesc}>
              {tab === "community" ? "A comunidade está esperando. Envie uma mensagem para começar." : "Envie uma mensagem e o mentor responderá em breve."}
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
              const isPinned = !!msg.pinnedUntil && new Date(msg.pinnedUntil).getTime() > Date.now();
              const canPin = viewerIsAdmin && tab === "community";
              return (
                <div key={msg.id} className={cx(styles.message, isMine ? styles.messageMine : styles.messageOther)}>
                  {!isMine && (
                    <div className={cx(styles.avatar, isAdmin && styles.avatarAdmin)}>
                      <span className={styles.avatarInitial}>{msg.sender.name?.[0]?.toUpperCase() || "?"}</span>
                      {msg.sender.avatarUrl && (
                        <img src={avatarSrc(msg.sender.avatarUrl)} alt="" className={styles.avatarImg} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      )}
                    </div>
                  )}

                  <div className={styles.bubbleWrap}>
                    <span className={styles.swipeIndicator} data-reply-ind aria-hidden><ReplyIcon size={16} /></span>
                    {active && (
                      <div className={cx(styles.actionBar, isMine ? styles.actionBarMine : styles.actionBarOther)} onClick={(e) => e.stopPropagation()}>
                        {pinPickerId === msg.id ? (
                          <>
                            {PIN_OPTIONS.map((p) => (
                              <button key={p.value} type="button" className={styles.pinDur} onClick={() => pinMessage(msg.id, p.value)}>{p.label}</button>
                            ))}
                            <button type="button" className={styles.actionBtn} onClick={() => setPinPickerId(null)} aria-label="Cancelar">✕</button>
                          </>
                        ) : (
                          <>
                            {REACTION_EMOJIS.map((em) => (
                              <button key={em} type="button" className={styles.reactPick} onClick={() => toggleReaction(msg.id, em)} aria-label={`Reagir ${em}`}>{em}</button>
                            ))}
                            <span className={styles.actionDivider} />
                            <button type="button" className={styles.actionBtn} onClick={() => startReply(msg)} title="Responder" aria-label="Responder"><ReplyIcon /></button>
                            {msg.type !== "poll" && msg.type !== "image" && msg.type !== "audio" && (
                              <button type="button" className={styles.actionBtn} onClick={() => copyMessage(msg)} title="Copiar" aria-label="Copiar"><CopyIcon /></button>
                            )}
                            {canPin && (
                              isPinned
                                ? <button type="button" className={cx(styles.actionBtn, styles.actionBtnActive)} onClick={() => unpinMessage(msg.id)} title="Desafixar" aria-label="Desafixar"><PinIcon /></button>
                                : <button type="button" className={styles.actionBtn} onClick={() => setPinPickerId(msg.id)} title="Fixar" aria-label="Fixar"><PinIcon /></button>
                            )}
                            {canDelete(msg) && (
                              <button type="button" className={cx(styles.actionBtn, styles.actionBtnDanger)} onClick={() => handleDelete(msg.id)} title="Apagar" aria-label="Apagar"><TrashIcon /></button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div
                      className={cx(styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther, isAdmin && !isMine && styles.bubbleAdmin, isPinned && styles.bubblePinned)}
                      onTouchStart={(e) => onMsgTouchStart(e, msg)}
                      onTouchMove={onMsgTouchMove}
                      onTouchEnd={(e) => onMsgTouchEnd(e, msg)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                        setActiveMsgId(active ? null : msg.id);
                        setPinPickerId(null);
                      }}
                    >
                      {!isMine && (
                        <div className={styles.senderRow}>
                          <span className={cx(styles.senderName, isAdmin && styles.senderAdmin)}>{msg.sender.name}</span>
                          {isAdmin && <span className={styles.modBadge}>Moderador</span>}
                          {isPinned && <span className={styles.pinnedTag}><PinIcon size={9} /> Fixado</span>}
                        </div>
                      )}

                      {msg.replyTo && (
                        <div className={styles.replyQuote}>
                          <span className={styles.replyQuoteName}>{msg.replyTo.sender?.name || "Mensagem"}</span>
                          <span className={styles.replyQuoteText}>
                            {msg.replyTo.type === "image" ? "📷 Imagem" : msg.replyTo.type === "audio" ? "🎤 Áudio" : msg.replyTo.type === "poll" ? "📊 Enquete" : truncate(msg.replyTo.content, 120)}
                          </span>
                        </div>
                      )}

                      {renderMessageBody(msg)}

                      <div className={styles.bubbleFooter}>
                        <span className={styles.bubbleTime}>{formatTime(msg.createdAt)}</span>
                        <button type="button" className={styles.reactCue} onClick={(e) => { e.stopPropagation(); setActiveMsgId(active ? null : msg.id); }} aria-label="Reagir ou responder" title="Reagir / responder">
                          <SmileIcon size={14} />
                        </button>
                      </div>
                    </div>

                    {reactions.length > 0 && (
                      <div className={cx(styles.reactions, isMine && styles.reactionsMine)}>
                        {reactions.map((r) => (
                          <button key={r.emoji} type="button" className={cx(styles.reactionChip, r.mine && styles.reactionChipMine)} onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, r.emoji); }}>
                            <span>{r.emoji}</span><span className={styles.reactionCount}>{r.count}</span>
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
              <span className={styles.replyBarText}>{truncate(replyingTo.content || (replyingTo.type === "image" ? "📷 Imagem" : replyingTo.type === "audio" ? "🎤 Áudio" : "Enquete"), 90)}</span>
            </div>
            <button type="button" className={styles.replyBarClose} onClick={() => setReplyingTo(null)} aria-label="Cancelar resposta">✕</button>
          </div>
        )}

        {showMentionBox && (mentionResults.length > 0 || mentionAllMatches) && (
          <div className={styles.mentionBox}>
            {mentionAllMatches && (
              <button type="button" className={styles.mentionItem} onClick={() => insertMention("todos")}>
                <span className={cx(styles.mentionAvatar, styles.mentionAll)}>@</span>
                <span className={styles.mentionName}>todos <span className={styles.mentionHint}>· notifica a comunidade</span></span>
              </button>
            )}
            {mentionResults.map((m) => (
              <button key={m.id} type="button" className={styles.mentionItem} onClick={() => insertMention(m.name, m.id)}>
                <span className={styles.mentionAvatar}>
                  {m.avatarUrl ? <img src={avatarSrc(m.avatarUrl)} alt="" /> : (m.name[0]?.toUpperCase() || "?")}
                </span>
                <span className={styles.mentionName}>{m.name}</span>
              </button>
            ))}
          </div>
        )}

        {recording ? (
          <div className={styles.recordBar}>
            <span className={styles.recordDot} />
            <span className={styles.recordTime}>{fmtDuration(recSeconds)}</span>
            <span className={styles.recordHint}>Gravando áudio…</span>
            <button type="button" className={styles.recordCancel} onClick={cancelRecording}>Cancelar</button>
            <button type="button" className={styles.recordStop} onClick={stopRecording} aria-label="Enviar áudio"><SendIcon size={16} /></button>
          </div>
        ) : (
          <div className={styles.inputBar}>
            <div className={styles.attachWrap}>
              <button type="button" className={styles.attachBtn} onClick={() => setAttachOpen((v) => !v)} disabled={uploading} aria-label="Anexar">＋</button>
              {attachOpen && (
                <div className={styles.attachMenu} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className={styles.attachItem} onClick={() => imageInputRef.current?.click()}><ImageIcon size={17} /> Imagem</button>
                  <button type="button" className={styles.attachItem} onClick={startRecording}><MicIcon size={17} /> Áudio</button>
                  {tab === "community" && (
                    <button type="button" className={styles.attachItem} onClick={() => { setAttachOpen(false); setPollOpen(true); }}><PollIcon size={17} /> Enquete</button>
                  )}
                </div>
              )}
            </div>
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={onPickImage} />
            <input
              ref={inputRef}
              className={styles.inputField}
              placeholder={uploading ? "Enviando…" : tab === "community" ? "Mensagem para a comunidade… (use @ para mencionar)" : "Mensagem para o mentor…"}
              value={input}
              onChange={onInputChange}
              onKeyDown={handleKeyDown}
              disabled={uploading}
              maxLength={2000}
            />
            <button type="button" className={styles.sendBtn} onClick={handleSend} disabled={!input.trim() || sending || uploading} aria-label="Enviar"><SendIcon /></button>
          </div>
        )}
      </div>

      {pollOpen && (
        <PollComposer
          onClose={() => setPollOpen(false)}
          onSubmit={async (poll) => {
            const ok = await sendPayload({ type: "poll", poll });
            if (ok) setPollOpen(false);
          }}
        />
      )}

      {lightbox && (
        <div className={styles.lightbox} onClick={() => setLightbox(null)}>
          <button type="button" className={styles.lightboxClose} aria-label="Fechar">✕</button>
          <img src={lightbox} alt="" className={styles.lightboxImg} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

// ── Poll creation modal ──
function PollComposer({ onClose, onSubmit }: { onClose: () => void; onSubmit: (poll: { question: string; options: string[]; allowMultiple: boolean; expiresHours: number }) => Promise<void> }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [expires, setExpires] = useState("0");
  const [busy, setBusy] = useState(false);

  const setOpt = (i: number, v: string) => setOptions((o) => o.map((x, idx) => (idx === i ? v : x)));
  const addOpt = () => setOptions((o) => (o.length < 12 ? [...o, ""] : o));
  const removeOpt = (i: number) => setOptions((o) => (o.length > 2 ? o.filter((_, idx) => idx !== i) : o));

  const valid = question.trim().length > 0 && options.map((o) => o.trim()).filter(Boolean).length >= 2;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    await onSubmit({
      question: question.trim(),
      options: options.map((o) => o.trim()).filter(Boolean),
      allowMultiple,
      expiresHours: Number(expires),
    });
    setBusy(false);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalTitle}>Nova enquete</div>
        <input className={styles.modalInput} placeholder="Pergunta" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={300} autoFocus />
        <div className={styles.modalOptions}>
          {options.map((o, i) => (
            <div key={i} className={styles.modalOptionRow}>
              <input className={styles.modalInput} placeholder={`Opção ${i + 1}`} value={o} onChange={(e) => setOpt(i, e.target.value)} maxLength={120} />
              {options.length > 2 && <button type="button" className={styles.modalRemoveOpt} onClick={() => removeOpt(i)} aria-label="Remover">✕</button>}
            </div>
          ))}
          {options.length < 12 && <button type="button" className={styles.modalAddOpt} onClick={addOpt}>＋ Adicionar opção</button>}
        </div>
        <label className={styles.modalCheckRow}>
          <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
          <span>Permitir múltipla escolha</span>
        </label>
        <div className={styles.modalField}>
          <span className={styles.modalFieldLabel}>Encerrar</span>
          <select className={styles.modalSelect} value={expires} onChange={(e) => setExpires(e.target.value)}>
            <option value="0">Sem prazo</option>
            <option value="1">Em 1 hora</option>
            <option value="24">Em 1 dia</option>
            <option value="168">Em 7 dias</option>
          </select>
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="button" className={styles.btnPrimary} onClick={submit} disabled={!valid || busy}>{busy ? "Criando…" : "Criar enquete"}</button>
        </div>
      </div>
    </div>
  );
}
