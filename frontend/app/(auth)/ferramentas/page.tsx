"use client";
import { useEffect, useState } from "react";
import { PageHeader, Card, Button, Badge, useToast } from "@/components/ui";
import { MessageCircle, GitBranch, Megaphone, MessagesSquare, Users, Plus } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const KOMUNIKA_FEATURES = [
  { icon: GitBranch, label: "Funis de conversa" },
  { icon: Megaphone, label: "Campanhas em massa" },
  { icon: MessagesSquare, label: "Conversas e atendimento" },
  { icon: Users, label: "Contactos organizados" },
];

export default function FerramentasPage() {
  const toast = useToast();
  const [komunikaActive, setKomunikaActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}` });

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => { if (d?.user) setKomunikaActive(!!d.user.komunikaActive); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Open the embedded Komunika via SSO. The backend mints a short-lived
  // magic-link; the JWT secret never reaches the browser. Open the tab
  // synchronously on click so popup blockers don't swallow it, then navigate.
  const openKomunika = async () => {
    const win = window.open("about:blank", "_blank");
    setOpening(true);
    try {
      const res = await fetch(`${API}/api/komunika/sso-link`, { headers: hdr() });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        if (win) win.location.href = data.url;
        else window.location.href = data.url; // popup blocked → same tab
      } else {
        if (win) win.close();
        toast.error("Não foi possível abrir o Komunika", data.error);
      }
    } catch {
      if (win) win.close();
      toast.error("Erro de conexão");
    }
    setOpening(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        label="Conta · Ferramentas"
        title="Ferramentas"
        description="Seu hub de ferramentas e integrações. Abra direto, sem login extra."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {/* ── Komunika ── */}
        <Card padding="lg">
          <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 44,
                  height: 44,
                  borderRadius: "var(--radius-md)",
                  background: "var(--accent-dim)",
                  color: "var(--accent)",
                  flexShrink: 0,
                }}
              >
                <MessageCircle size={22} strokeWidth={1.7} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text-primary)" }}>Komunika</div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>Automação de WhatsApp</div>
              </div>
              <Badge variant={komunikaActive ? "success" : "neutral"} size="sm">
                {loading ? "…" : komunikaActive ? "Incluído no plano" : "Preparando"}
              </Badge>
            </div>

            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)", margin: 0 }}>
              Plataforma de WhatsApp do Código Zero: centralize o atendimento, dispare campanhas e
              organize contactos e funis — tudo num só lugar, já incluído na sua assinatura.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {KOMUNIKA_FEATURES.map(({ icon: Icon, label }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={15} strokeWidth={1.7} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                1 número WhatsApp · 2 atendentes
              </span>
              <Button
                variant="accent"
                onClick={openKomunika}
                loading={opening}
                disabled={loading || !komunikaActive}
              >
                Abrir Komunika ↗
              </Button>
              {!loading && !komunikaActive && (
                <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                  Seu acesso está sendo preparado — tente novamente em alguns minutos.
                </span>
              )}
            </div>
          </div>
        </Card>

        {/* ── Placeholder: future tools ── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: 180,
            padding: 24,
            border: "1px dashed var(--border-strong)",
            borderRadius: "var(--radius-md)",
            color: "var(--text-tertiary)",
            textAlign: "center",
          }}
        >
          <Plus size={20} strokeWidth={1.6} />
          <span style={{ fontSize: 13 }}>Mais ferramentas em breve</span>
        </div>
      </div>
    </div>
  );
}
