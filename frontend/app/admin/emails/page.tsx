"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  RowActions,
  type Column,
  type RowAction,
} from "@/components/admin";
import { useToast } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

type EmailRow = { resendId: string; recipient?: string | null; subject?: string | null; status: string; lastAt: string };
type Counts = { sent?: number; delivered?: number; opened?: number; clicked?: number; bounced?: number; complained?: number };
type Tone = "good" | "warn" | "danger" | "accent" | "neutral" | "info";

const TYPE_LABEL: Record<string, string> = {
  "email.sent": "Enviado",
  "email.delivered": "Entregue",
  "email.delivery_delayed": "Atrasado",
  "email.bounced": "Bounce",
  "email.complained": "Spam",
  "email.opened": "Aberto",
  "email.clicked": "Clicado",
};

// Tom do badge por estágio de entrega — warn/danger só para o que exige atenção.
function deliveryTone(type: string): Tone {
  if (type === "email.delivered") return "good";
  if (type === "email.opened" || type === "email.clicked") return "accent";
  if (type === "email.bounced" || type === "email.complained") return "danger";
  if (type === "email.delivery_delayed") return "warn";
  return "neutral";
}

const fmt = (n?: number) => (n ?? 0).toLocaleString("pt-BR");
const fmtTime = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function AdminEmails() {
  const toast = useToast();
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [counts, setCounts] = useState<Counts>({});
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams({ days: String(days), page: String(page), pageSize: String(pageSize) });
      const res = await fetch(`${API}/api/admin/email-events?${p}`, { headers: hdr() });
      const data = await res.json();
      setEmails(data.emails || data.items || []);
      setCounts(data.counts || {});
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setUpdatedAt(new Date().toLocaleTimeString("pt-BR"));
    } catch {
      /* ignore transient errors during polling */
    }
    // Só o primeiro carregamento mostra skeleton; o polling troca os dados no lugar.
    setLoading(false);
  }, [days, page]);

  // Polling ~8s. O timer reinicia quando janela/página mudam (load muda de identidade).
  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  // Trocar a janela reinicia para a página 1 (busca única).
  const onDays = (v: number) => { setDays(v); setPage(1); };

  const copyEmail = (e: EmailRow) => {
    if (!e.recipient) return;
    navigator.clipboard.writeText(e.recipient)
      .then(() => toast.success("E-mail copiado"))
      .catch(() => toast.error("Não foi possível copiar"));
  };

  const columns: Column<EmailRow>[] = [
    {
      key: "recipient", header: "Destinatário", primaryOnMobile: true,
      render: (e) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{e.recipient || "—"}</span>
          {e.subject && <span className={k.cellSub} title={e.subject}>{e.subject}</span>}
        </div>
      ),
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (e) => <StatusBadge tone={deliveryTone(e.status)}>{TYPE_LABEL[e.status] || e.status}</StatusBadge>,
    },
    { key: "lastAt", header: "Atualizado", muted: true, render: (e) => fmtTime(e.lastAt) },
  ];

  const rowActions = (e: EmailRow): ReactNode => {
    const items: RowAction[] = [
      { label: "Copiar e-mail", onClick: () => copyEmail(e), disabled: !e.recipient },
    ];
    return <RowActions items={items} />;
  };

  return (
    <AdminPage
      title="E-mails"
      actions={<StatusBadge tone="accent">{updatedAt ? `Atualizado ${updatedAt}` : "Ao vivo"}</StatusBadge>}
      kpis={
        <StatRow>
          <StatTile accent label="Enviados" loading={loading} value={fmt(counts.sent)} />
          <StatTile label="Entregues" loading={loading} value={fmt(counts.delivered)} tone="good" />
          <StatTile label="Abertos" loading={loading} value={fmt(counts.opened)} />
          <StatTile label="Clicados" loading={loading} value={fmt(counts.clicked)} />
          <StatTile label="Bounces" loading={loading} value={fmt(counts.bounced)} tone={counts.bounced ? "danger" : undefined} />
          <StatTile label="Spam" loading={loading} value={fmt(counts.complained)} tone={counts.complained ? "danger" : undefined} />
        </StatRow>
      }
    >
      <DataTable
        columns={columns}
        rows={emails}
        getRowKey={(e) => e.resendId}
        loading={loading}
        empty={{ title: "Nenhum e-mail ainda", desc: "Configure o webhook do Resend em Configurações → E-mail (Resend)." }}
        rowActions={rowActions}
        pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
        toolbar={
          <>
            <select className={k.select} value={days} onChange={(e) => onDays(Number(e.target.value))} aria-label="Janela">
              <option value={7}>Últimos 7 dias</option>
              <option value={14}>Últimos 14 dias</option>
              <option value={30}>Últimos 30 dias</option>
            </select>
            <div className={k.toolbarSpacer} />
          </>
        }
      />
    </AdminPage>
  );
}
