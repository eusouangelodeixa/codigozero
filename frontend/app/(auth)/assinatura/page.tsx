"use client";
import { useState, useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
};

export default function AssinaturaPage() {
  const [user, setUser] = useState<any>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelStep, setCancelStep] = useState(1);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [canceling, setCanceling] = useState(false);
  const [retentionOffer, setRetentionOffer] = useState<{ code: string; discount: string } | null>(null);
  const [loadingOffer, setLoadingOffer] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then(r => r.json())
      .then(data => { if (data.user) setUser(data.user); });
  }, []);

  const handleCancelSubscription = async () => {
    setCanceling(true);
    try {
      const res = await fetch(`${API}/api/auth/cancel-subscription`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({
          password: cancelPassword,
          reason: cancelReason || undefined,
          feedback: cancelFeedback || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Assinatura cancelada. Você pode renovar a qualquer momento.");
        setUser({ ...user, subscriptionStatus: "canceled" });
        setCancelOpen(false);
        setCancelPassword("");
        setCancelReason("");
        setCancelFeedback("");
        setCancelStep(1);
      } else {
        showToast(data.error || "Erro ao cancelar", "error");
      }
    } catch {
      showToast("Erro de conexão", "error");
    }
    setCanceling(false);
  };

  const statusLabel = (s: string) => {
    const map: Record<string, { text: string; color: string; icon: string }> = {
      active: { text: "Ativa", color: "#22c55e", icon: "✅" },
      lead: { text: "Aguardando Pagamento", color: "#eab308", icon: "⏳" },
      grace_period: { text: "Período de Graça", color: "#eab308", icon: "⚠️" },
      overdue: { text: "Atrasada", color: "#ef4444", icon: "🔒" },
      canceled: { text: "Cancelada", color: "#ef4444", icon: "🚫" },
    };
    return map[s] || { text: s, color: "#888", icon: "❓" };
  };

  if (!user) return null;

  const status = statusLabel(user.subscriptionStatus);
  const isActive = user.subscriptionStatus === "active";
  const daysLeft = user.subscriptionEnd
    ? Math.ceil((new Date(user.subscriptionEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const needsRenewal = ["grace_period", "overdue", "canceled"].includes(user.subscriptionStatus) || (isActive && daysLeft !== null && daysLeft <= 3);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Assinatura</h1>
      <p style={{ fontSize: 14, color: "#888", marginBottom: 32 }}>Gerencie o seu plano e pagamentos</p>

      {/* ══ Status Hero ══ */}
      <div style={{
        background: `${status.color}08`, border: `1px solid ${status.color}25`,
        borderRadius: 16, padding: 28, marginBottom: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{status.icon}</div>
        <span style={{
          display: "inline-block", padding: "4px 16px", borderRadius: 999,
          fontSize: 13, fontWeight: 700, background: `${status.color}18`, color: status.color,
          marginBottom: 12,
        }}>
          {status.text}
        </span>

        {isActive && daysLeft !== null && (
          <p style={{ fontSize: 14, color: "#ccc", margin: "8px 0 0" }}>
            {daysLeft > 3
              ? <>Sua assinatura renova em <strong style={{ color: "#2DD4BF" }}>{daysLeft} dias</strong></>
              : daysLeft > 0
                ? <>Sua assinatura expira em <strong style={{ color: "#eab308" }}>{daysLeft} dia{daysLeft > 1 ? "s" : ""}</strong></>
                : <strong style={{ color: "#ef4444" }}>Sua assinatura expirou hoje</strong>
            }
          </p>
        )}

        {needsRenewal && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 13, color: "#aaa", marginBottom: 12 }}>
              {user.subscriptionStatus === "active" 
                ? "Renove agora de forma antecipada para garantir o seu acesso contínuo."
                : user.subscriptionStatus === "grace_period"
                ? "Você tem até 72h de acesso restante. Renove para não perder nada."
                : "Renove agora para recuperar o acesso a todas as aulas, scripts e ferramentas."}
            </p>
            <a
              href={user.renewalUrl || user.checkoutUrl || "/"}
              target="_blank"
              rel="noopener"
              style={{
                display: "inline-block", padding: "10px 28px", borderRadius: 8,
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none",
                transition: "opacity 0.15s",
              }}
            >
              🔄 Renovar Assinatura
            </a>
          </div>
        )}
      </div>

      {/* ══ Plan Details ══ */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Detalhes do Plano</h2>

        <div className="grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Plano</p>
            <p style={{ fontSize: 15, color: "#fff", fontWeight: 500, margin: 0 }}>Código Zero — Mensal</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Valor</p>
            <p style={{ fontSize: 15, color: "#2DD4BF", fontWeight: 600, margin: 0 }}>797 MT/mês</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Membro desde</p>
            <p style={{ fontSize: 15, color: "#fff", margin: 0 }}>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</p>
          </div>
          {user.subscriptionEnd && (
            <div>
              <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                {isActive ? "Próxima renovação" : "Expirou em"}
              </p>
              <p style={{ fontSize: 15, color: "#fff", margin: 0 }}>
                {new Date(user.subscriptionEnd).toLocaleDateString("pt-BR")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ══ What's Included ══ */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 16 }}>O que está incluído</h2>
        <div className="grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { icon: "🎓", text: "Aulas completas" },
            { icon: "📄", text: "Scripts de prospecção" },
            { icon: "🔍", text: "Radar de leads" },
            { icon: "💬", text: "Chat da comunidade" },
            { icon: "🎧", text: "Suporte com mentor" },
            { icon: "🤖", text: "Automações WhatsApp" },
          ].map((item, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
              borderRadius: 8, background: isActive ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)",
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              <span style={{ fontSize: 13, color: isActive ? "#ccc" : "#666" }}>{item.text}</span>
              {isActive
                ? <span style={{ marginLeft: "auto", color: "#22c55e", fontSize: 12 }}>✓</span>
                : <span style={{ marginLeft: "auto", color: "#ef4444", fontSize: 12 }}>✕</span>
              }
            </div>
          ))}
        </div>
      </div>

      {/* ══ Danger Zone ══ */}
      {isActive && (
        <div style={{
          background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.1)",
          borderRadius: 16, padding: 24,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#ef4444", marginBottom: 8 }}>Zona de Perigo</h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
            Ao cancelar, você perderá acesso imediato a todo o conteúdo da plataforma.
          </p>
          <button
            onClick={() => setCancelOpen(true)}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12,
              background: "none", border: "1px solid rgba(239,68,68,0.25)",
              color: "#ef4444", cursor: "pointer", opacity: 0.7,
              transition: "opacity 0.15s",
            }}
            onMouseOver={e => e.currentTarget.style.opacity = "1"}
            onMouseOut={e => e.currentTarget.style.opacity = "0.7"}
          >
            Cancelar Assinatura
          </button>
        </div>
      )}

      {/* ══ Cancel Modal — Multi-step ══ */}
      {cancelOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }}>
          <div style={{
            background: "#141419", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 16, padding: 28, maxWidth: 460, width: "100%",
            maxHeight: "85vh", overflowY: "auto",
          }}>
            {cancelStep === 1 ? (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#ef4444", marginBottom: 12 }}>
                  😔 Antes de ir...
                </h3>
                <p style={{ fontSize: 13, color: "#aaa", marginBottom: 16, lineHeight: 1.6 }}>
                  Gostaríamos de entender o motivo. Isso nos ajuda a melhorar. <span style={{ color: "#666" }}>(Opcional)</span>
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {[
                    "Não estou usando a plataforma",
                    "O preço não cabe no meu orçamento",
                    "Não encontrei o que esperava",
                    "Vou usar outra solução",
                    "Problemas técnicos",
                    "Outro motivo",
                  ].map((reason) => (
                    <label key={reason} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      borderRadius: 8, cursor: "pointer", fontSize: 13, color: "#ccc",
                      background: cancelReason === reason ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${cancelReason === reason ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.04)"}`,
                      transition: "all 0.15s",
                    }}>
                      <input
                        type="radio" name="cancelReason"
                        checked={cancelReason === reason}
                        onChange={() => setCancelReason(reason)}
                        style={{ accentColor: "#ef4444" }}
                      />
                      {reason}
                    </label>
                  ))}
                </div>

                <textarea
                  placeholder="Algo mais que gostaria de compartilhar? (Opcional)"
                  value={cancelFeedback}
                  onChange={e => setCancelFeedback(e.target.value)}
                  rows={3}
                  style={{
                    ...inputStyle, resize: "vertical", marginBottom: 16,
                    minHeight: 70,
                  }}
                />

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setCancelOpen(false); setCancelReason(""); setCancelFeedback(""); setCancelStep(1); }}
                    style={{
                      padding: "8px 18px", borderRadius: 8, fontSize: 13,
                      background: "none", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#aaa", cursor: "pointer",
                    }}
                  >
                    Desistir
                  </button>
                  <button
                    onClick={async () => {
                      const isPriceReason = cancelReason === "O preço não cabe no meu orçamento";
                      if (isPriceReason) {
                        setCancelStep(2);
                        setLoadingOffer(true);
                        try {
                          const res = await fetch(`${API}/api/auth/retention-offer`, { method: "POST", headers: hdr() });
                          const data = await res.json();
                          if (data.offer) setRetentionOffer(data.offer);
                        } catch {}
                        setLoadingOffer(false);
                      } else {
                        // Skip coupon step — go directly to password confirmation
                        setCancelStep(3);
                      }
                    }}
                    style={{
                      padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
                      color: "#ef4444", cursor: "pointer",
                    }}
                  >
                    Continuar →
                  </button>
                </div>
              </>
            ) : cancelStep === 2 ? (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#f59e0b", marginBottom: 12 }}>✨ Antes de ir...</h3>
                {loadingOffer ? (
                  <p style={{ fontSize: 13, color: "#aaa", textAlign: "center", padding: 20 }}>Preparando oferta especial...</p>
                ) : retentionOffer ? (
                  <div style={{ padding: 20, borderRadius: 12, background: "rgba(45,212,191,0.06)", border: "1px solid rgba(45,212,191,0.15)", marginBottom: 16 }}>
                    <p style={{ fontSize: 14, color: "#fff", fontWeight: 600, marginBottom: 8 }}>
                      🎁 Temos uma oferta exclusiva para você!
                    </p>
                    <p style={{ fontSize: 13, color: "#ccc", lineHeight: 1.6, marginBottom: 12 }}>
                      Use o cupom abaixo na próxima renovação e ganhe <strong style={{ color: "#2DD4BF" }}>{retentionOffer.discount} de desconto</strong>:
                    </p>
                    <div style={{
                      padding: "12px 20px", borderRadius: 8, background: "rgba(45,212,191,0.1)",
                      border: "1px dashed #2DD4BF", textAlign: "center",
                      fontSize: 18, fontWeight: 700, color: "#2DD4BF", letterSpacing: 2,
                    }}>
                      {retentionOffer.code}
                    </div>
                    <p style={{ fontSize: 11, color: "#888", marginTop: 8, textAlign: "center" }}>
                      Válido para 1 uso. Copie e use no checkout.
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "#aaa", marginBottom: 16, lineHeight: 1.6 }}>
                    Sentimos muito que está pensando em sair. Tem certeza que deseja continuar com o cancelamento?
                  </p>
                )}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => { setCancelOpen(false); setCancelStep(1); setCancelReason(""); setCancelFeedback(""); setRetentionOffer(null); }}
                    style={{
                      padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: "rgba(45,212,191,0.08)", border: "1px solid rgba(45,212,191,0.2)",
                      color: "#2DD4BF", cursor: "pointer",
                    }}
                  >
                    ✅ Vou ficar!
                  </button>
                  <button
                    onClick={() => setCancelStep(3)}
                    style={{
                      padding: "8px 18px", borderRadius: 8, fontSize: 13,
                      background: "none", border: "1px solid rgba(255,255,255,0.08)",
                      color: "#888", cursor: "pointer",
                    }}
                  >
                    Cancelar mesmo assim
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#ef4444", marginBottom: 8 }}>⚠️ Confirmar Cancelamento</h3>
                <p style={{ fontSize: 13, color: "#aaa", marginBottom: 6, lineHeight: 1.6 }}>
                  Tem certeza? Ao cancelar você perderá acesso imediato a:
                </p>
                <ul style={{ fontSize: 12, color: "#888", marginBottom: 16, paddingLeft: 16, lineHeight: 1.8 }}>
                  <li>Todas as aulas e materiais</li>
                  <li>Scripts de prospecção</li>
                  <li>Radar de leads</li>
                  <li>Chat da comunidade</li>
                </ul>
                <p style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
                  Digite sua senha para confirmar:
                </p>
                <input
                  type="password"
                  placeholder="Sua senha"
                  value={cancelPassword}
                  onChange={e => setCancelPassword(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 16 }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    onClick={() => setCancelStep(2)}
                    style={{
                      padding: "8px 18px", borderRadius: 8, fontSize: 13,
                      background: "none", border: "1px solid rgba(255,255,255,0.1)",
                      color: "#aaa", cursor: "pointer",
                    }}
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={handleCancelSubscription}
                    disabled={canceling || !cancelPassword}
                    style={{
                      padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
                      color: "#ef4444", cursor: canceling ? "not-allowed" : "pointer",
                      opacity: canceling ? 0.7 : 1,
                    }}
                  >
                    {canceling ? "Cancelando..." : "Confirmar Cancelamento"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          padding: "12px 20px", borderRadius: 8,
          background: toast.type === "success" ? "rgba(45,212,191,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(45,212,191,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#2DD4BF" : "#ef4444",
          fontSize: 13,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
