"use client";
import { useState, useEffect } from "react";
import styles from "../auth.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function PerfilPage() {
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
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
      .then(data => {
        if (data.user) {
          setUser(data.user);
          setForm({ name: data.user.name || "", phone: data.user.phone || "" });
        }
      });
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/auth/profile`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setUser({ ...user, ...data.user });
        localStorage.setItem("cz_user", JSON.stringify({ ...user, ...data.user }));
        showToast("Perfil atualizado com sucesso ✓");
      } else {
        showToast(data.error || "Erro ao atualizar", "error");
      }
    } catch {
      showToast("Erro de conexão", "error");
    }
    setSaving(false);
  };

  const changePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      showToast("As senhas não coincidem.", "error");
      return;
    }
    setChangingPw(true);
    try {
      const res = await fetch(`${API}/api/auth/password`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Senha alterada com sucesso ✓");
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        showToast(data.error || "Erro ao alterar senha", "error");
      }
    } catch {
      showToast("Erro de conexão", "error");
    }
    setChangingPw(false);
  };

  const statusLabel = (s: string) => {
    const map: Record<string, { text: string; color: string }> = {
      active: { text: "Ativa", color: "#22c55e" },
      lead: { text: "Aguardando Pagamento", color: "#eab308" },
      grace_period: { text: "Período de Graça", color: "#eab308" },
      overdue: { text: "Atrasada", color: "#ef4444" },
      canceled: { text: "Cancelada", color: "#ef4444" },
    };
    return map[s] || { text: s, color: "#888" };
  };

  if (!user) return null;

  const status = statusLabel(user.subscriptionStatus);

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Meu Perfil</h1>
      <p style={{ fontSize: 14, color: "#888", marginBottom: 32 }}>Gerencie suas informações e assinatura</p>

      {/* ══ Subscription Card ══ */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(45,212,191,0.12)",
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fff", margin: 0 }}>Assinatura</h2>
          <span style={{
            padding: "4px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600,
            background: `${status.color}20`, color: status.color,
          }}>{status.text}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Plano</p>
            <p style={{ fontSize: 15, color: "#fff", fontWeight: 500 }}>Código Zero — Mensal</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Valor</p>
            <p style={{ fontSize: 15, color: "#2DD4BF", fontWeight: 600 }}>797 MT/mês</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Membro desde</p>
            <p style={{ fontSize: 15, color: "#fff" }}>{new Date(user.createdAt).toLocaleDateString("pt-BR")}</p>
          </div>
          {user.subscriptionEnd && (
            <div>
              <p style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Próxima Renovação</p>
              <p style={{ fontSize: 15, color: "#fff" }}>{new Date(user.subscriptionEnd).toLocaleDateString("pt-BR")}</p>
            </div>
          )}
        </div>
      </div>

      {/* ══ Profile Form ══ */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(45,212,191,0.08)",
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Informações Pessoais</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Nome</label>
            <input
              style={inputStyle}
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Telefone</label>
            <input
              style={inputStyle}
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Email</label>
          <input style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} value={user.email} disabled />
          <p style={{ fontSize: 11, color: "#555", marginTop: 4 }}>O email não pode ser alterado.</p>
        </div>

        <button
          onClick={saveProfile}
          disabled={saving}
          style={btnPrimaryStyle}
        >
          {saving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>

      {/* ══ Password Change ══ */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(45,212,191,0.08)",
        borderRadius: 16, padding: 24,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Alterar Senha</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Senha Atual</label>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.currentPassword}
              onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Nova Senha</label>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.newPassword}
              onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Confirmar Nova Senha</label>
            <input
              type="password"
              style={inputStyle}
              value={pwForm.confirmPassword}
              onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
            />
          </div>
        </div>

        <button
          onClick={changePassword}
          disabled={changingPw || !pwForm.currentPassword || !pwForm.newPassword}
          style={{
            ...btnPrimaryStyle,
            background: "none",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#ccc",
          }}
        >
          {changingPw ? "Alterando..." : "Alterar Senha"}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          padding: "12px 20px", borderRadius: 8,
          background: toast.type === "success" ? "rgba(45,212,191,0.15)" : "rgba(239,68,68,0.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(45,212,191,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: toast.type === "success" ? "#2DD4BF" : "#ef4444",
          fontSize: 13,
          animation: "slideUp 0.3s ease-out",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 24px", borderRadius: 8, border: "none",
  background: "linear-gradient(135deg, #2DD4BF, #14b8a6)",
  color: "#0a0a0f", fontWeight: 600, fontSize: 13,
  cursor: "pointer",
};
