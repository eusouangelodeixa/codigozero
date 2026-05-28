"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, Send, RotateCcw, ShoppingCart, Users, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { subscribeToPush } from "@/lib/pushNotifications";
import styles from "../coproducer.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface Prefs {
  notifySale: boolean;
  notifyRenewal: boolean;
  notifyLead: boolean;
  notifyCredentialFail: boolean;
}

interface LogItem {
  id: string;
  type: "sale" | "renewal" | "lead" | "credential_fail" | "test" | "system";
  title: string;
  body: string;
  url: string | null;
  delivered: number;
  createdAt: string;
}

const TYPE_META: Record<LogItem["type"], { icon: any; color: string; label: string }> = {
  sale:            { icon: ShoppingCart,  color: "#22c55e", label: "Venda" },
  renewal:         { icon: RefreshCw,     color: "#3b82f6", label: "Renovação" },
  lead:            { icon: Users,         color: "#a855f7", label: "Lead" },
  credential_fail: { icon: AlertTriangle, color: "#ef4444", label: "Falha de acesso" },
  test:            { icon: Bell,          color: "#888",    label: "Teste" },
  system:          { icon: Bell,          color: "#888",    label: "Sistema" },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("pt-MZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function CoproducerNotifications() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [pushPerm, setPushPerm] = useState<NotificationPermission | "unsupported">("default");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const hdr = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
  });

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [prefsRes, histRes] = await Promise.all([
        fetch(`${API_URL}/api/coproducer/notifications/prefs`, { headers: hdr() }),
        fetch(`${API_URL}/api/coproducer/notifications/history?limit=100`, { headers: hdr() }),
      ]);
      const prefsData = await prefsRes.json();
      const histData = await histRes.json();
      setPrefs(prefsData.prefs);
      setLog(histData.items || []);
    } catch {
      showToast("err", "Falha ao carregar.");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPerm(Notification.permission);
    } else {
      setPushPerm("unsupported");
    }
  }, []);

  const togglePref = async (key: keyof Prefs) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); // optimistic
    try {
      const r = await fetch(`${API_URL}/api/coproducer/notifications/prefs`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!r.ok) throw new Error();
    } catch {
      setPrefs(prefs); // rollback
      showToast("err", "Falha ao salvar preferência.");
    }
  };

  const subscribe = async () => {
    setSubscribing(true);
    const ok = await subscribeToPush();
    setSubscribing(false);
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPerm(Notification.permission);
    }
    if (ok) showToast("ok", "Browser inscrito. Você vai receber notificações aqui.");
    else showToast("err", "Não foi possível inscrever. Veja a permissão do navegador.");
  };

  const testPush = async () => {
    try {
      const r = await fetch(`${API_URL}/api/coproducer/notifications/test`, {
        method: "POST",
        headers: hdr(),
      });
      const data = await r.json();
      if (data.delivered > 0) {
        showToast("ok", `Teste enviado para ${data.delivered} dispositivo(s).`);
      } else {
        showToast("err", "Nenhum dispositivo inscrito. Clica em 'Ativar' acima.");
      }
      // Refresh history so the test entry shows up
      load();
    } catch {
      showToast("err", "Falha no teste.");
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 880 }}>
      <header className={styles.pageHead}>
        <span className={styles.pageEyebrow}>Notificações</span>
        <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BellRing size={20} /> Push &amp; histórico
        </h1>
        <p className={styles.pageDesc}>
          Receba avisos no navegador (e celular/PWA) sempre que algo importante acontecer com o seu link.
        </p>
      </header>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed", top: 20, right: 20, zIndex: 100,
            padding: "10px 16px", borderRadius: 10, fontSize: 13,
            background: toast.kind === "ok" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
            color: toast.kind === "ok" ? "#22c55e" : "#ef4444",
            border: `1px solid ${toast.kind === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Subscribe card */}
      <section
        style={{
          padding: 16, marginBottom: 18,
          background: "var(--bg-card, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
              Push do navegador
            </div>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              {pushPerm === "granted"
                ? "✓ Permitido. Se instalou como PWA, chega no celular também."
                : pushPerm === "denied"
                ? "Permissão negada — habilite manualmente nas configurações do navegador."
                : pushPerm === "unsupported"
                ? "Seu navegador não suporta push."
                : "Permissão ainda não concedida."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={subscribe}
              disabled={subscribing || pushPerm === "unsupported"}
              style={{
                padding: "10px 18px", borderRadius: 10, border: "none",
                background: pushPerm === "granted" ? "rgba(34,197,94,0.15)" : "linear-gradient(135deg, #a855f7, #7c3aed)",
                color: pushPerm === "granted" ? "#22c55e" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: subscribing ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              {pushPerm === "granted" ? <Check size={14} /> : <Bell size={14} />}
              {pushPerm === "granted" ? "Re-inscrever" : subscribing ? "Pedindo..." : "Ativar"}
            </button>
            <button
              onClick={testPush}
              style={{
                padding: "10px 18px", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.1)", background: "none",
                color: "var(--text-secondary)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <Send size={14} /> Enviar teste
            </button>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section
        style={{
          padding: 16, marginBottom: 18,
          background: "var(--bg-card, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-tertiary)", marginBottom: 12 }}>
          Quais notificações quero receber
        </div>
        {loading || !prefs ? (
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Carregando…</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <PrefRow label="Venda nova atribuída a mim"        on={prefs.notifySale}           onClick={() => togglePref("notifySale")}           type="sale" />
            <PrefRow label="Renovação de assinante meu"        on={prefs.notifyRenewal}        onClick={() => togglePref("notifyRenewal")}        type="renewal" />
            <PrefRow label="Lead novo no meu link /c/{code}"   on={prefs.notifyLead}           onClick={() => togglePref("notifyLead")}           type="lead" />
            <PrefRow label="Falha na entrega de credenciais"   on={prefs.notifyCredentialFail} onClick={() => togglePref("notifyCredentialFail")} type="credential_fail" />
          </div>
        )}
      </section>

      {/* History */}
      <section
        style={{
          padding: 16,
          background: "var(--bg-card, rgba(255,255,255,0.02))",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
          borderRadius: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-tertiary)" }}>
            Histórico (últimas 100)
          </span>
          <button
            onClick={load}
            style={{
              padding: "6px 12px", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)", background: "none",
              color: "var(--text-tertiary)", fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <RotateCcw size={12} /> Atualizar
          </button>
        </div>

        {loading ? (
          <div style={{ color: "var(--text-tertiary)", fontSize: 13 }}>Carregando…</div>
        ) : log.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
            Sem notificações ainda. As próximas vão aparecer aqui.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {log.map((item) => {
              const meta = TYPE_META[item.type] || TYPE_META.system;
              const Icon = meta.icon;
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex", gap: 10, padding: 12,
                    background: "rgba(0,0,0,0.2)", borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: `${meta.color}1a`, color: meta.color,
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{item.title}</span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>{fmtDate(item.createdAt)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>{item.body}</div>
                    {item.delivered === 0 && (
                      <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 4, fontStyle: "italic" }}>
                        (não foi enviado — tipo desativado ou sem inscrição no navegador)
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function PrefRow({ label, on, onClick, type }: { label: string; on: boolean; onClick: () => void; type: LogItem["type"] }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(0,0,0,0.15)", cursor: "pointer", textAlign: "left",
        transition: "background 120ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: `${meta.color}1a`, color: meta.color,
          }}
        >
          <Icon size={14} />
        </div>
        <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{label}</span>
      </div>
      <div
        style={{
          width: 40, height: 22, borderRadius: 999, position: "relative",
          background: on ? "linear-gradient(135deg, #a855f7, #7c3aed)" : "rgba(255,255,255,0.08)",
          transition: "background 150ms",
        }}
      >
        <div
          style={{
            position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18,
            borderRadius: 999, background: "#fff", transition: "left 150ms",
          }}
        />
      </div>
    </button>
  );
}
