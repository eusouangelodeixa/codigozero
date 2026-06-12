"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

type EmailEvent = { id: string; type: string; recipient?: string; subject?: string; resendId?: string; createdAt: string };

const TYPE_LABEL: Record<string, string> = {
  "email.sent": "Enviado",
  "email.delivered": "Entregue",
  "email.delivery_delayed": "Atrasado",
  "email.bounced": "Bounce",
  "email.complained": "Spam",
  "email.opened": "Aberto",
  "email.clicked": "Clicado",
};

function badgeClass(type: string) {
  if (type === "email.delivered") return styles.badgeGreen;
  if (type === "email.opened" || type === "email.clicked") return styles.badgeTeal;
  if (type === "email.bounced" || type === "email.complained") return styles.badgeRed;
  if (type === "email.delivery_delayed") return styles.badgeYellow;
  return styles.badgeGray;
}

export default function AdminEmails() {
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/admin/email-events?days=7`, { headers: hdr() });
      const data = await res.json();
      setEvents(data.events || []);
      setCounts(data.counts || {});
      setUpdatedAt(new Date().toLocaleTimeString("pt-BR"));
    } catch {
      /* ignore transient errors during polling */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 8000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [load]);

  const tiles = [
    { key: "email.sent", label: "Enviados", color: "var(--text-primary)" },
    { key: "email.delivered", label: "Entregues", color: "#22c55e" },
    { key: "email.opened", label: "Abertos", color: "var(--accent)" },
    { key: "email.clicked", label: "Clicados", color: "var(--accent)" },
    { key: "email.bounced", label: "Bounces", color: "#f87171" },
    { key: "email.complained", label: "Spam", color: "#f87171" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--text-primary)" }}>E-mails (Resend)</h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-tertiary)" }}>
          Status de entrega em tempo real — últimos 7 dias{updatedAt ? ` · atualizado ${updatedAt}` : ""}. Atualiza sozinho a cada 8s.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {tiles.map((t) => (
          <div key={t.key} style={{ background: "var(--bg-glass)", border: "1px solid var(--border-default)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: t.color }}>{counts[t.key] || 0}</div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Evento</th><th>Destinatário</th><th>Assunto</th><th>Quando</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className={styles.empty}>Carregando…</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={4} className={styles.empty}>Nenhum evento ainda. Configure o webhook do Resend em Configurações → E-mail (Resend).</td></tr>
            ) : events.map((e) => (
              <tr key={e.id}>
                <td><span className={`${styles.badge} ${badgeClass(e.type)}`}>{TYPE_LABEL[e.type] || e.type}</span></td>
                <td>{e.recipient || "—"}</td>
                <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject || "—"}</td>
                <td>{new Date(e.createdAt).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
