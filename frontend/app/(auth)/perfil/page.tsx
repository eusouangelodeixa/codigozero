"use client";
import { useState, useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)", background: "rgba(0,0,0,0.3)",
  color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "10px 24px", borderRadius: 8, border: "none",
  background: "linear-gradient(135deg, #2DD4BF, #14b8a6)",
  color: "#0a0a0f", fontWeight: 600, fontSize: 13, cursor: "pointer",
};

export default function PerfilPage() {
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: "", phone: "", avatarUrl: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setForm({
            name: data.user.name || "",
            phone: data.user.phone || "",
            avatarUrl: data.user.avatarUrl || "",
          });
        }
      });
  }, []);

  const avatarSrc = form.avatarUrl
    ? form.avatarUrl.startsWith('/')
      ? `${API}${form.avatarUrl}`
      : form.avatarUrl
    : null;

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await fetch(`${API}/api/auth/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('cz_token')}` },
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        setForm({ ...form, avatarUrl: data.avatarUrl });
        setUser({ ...user, avatarUrl: data.avatarUrl });
        localStorage.setItem('cz_user', JSON.stringify({ ...user, avatarUrl: data.avatarUrl }));
        showToast('Foto atualizada ✓');
      } else {
        showToast(data.error || 'Erro no upload', 'error');
      }
    } catch {
      showToast('Erro de conexão', 'error');
    }
    setUploading(false);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/auth/profile`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({ name: form.name, phone: form.phone }),
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

  if (!user) return null;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Meu Perfil</h1>
      <p style={{ fontSize: 14, color: "#888", marginBottom: 32 }}>Gerencie suas informações pessoais</p>

      {/* ══ Avatar + Info ══ */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(45,212,191,0.08)",
        borderRadius: 16, padding: 24, marginBottom: 24,
      }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 20 }}>Informações Pessoais</h2>

        {/* Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: 72, height: 72, borderRadius: "50%", overflow: "hidden",
              background: "rgba(255,255,255,0.06)", border: "2px solid rgba(45,212,191,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, fontWeight: 700, color: "#2DD4BF", flexShrink: 0,
              cursor: "pointer", position: "relative",
              transition: "border-color 0.15s",
            }}
            onMouseOver={e => e.currentTarget.style.borderColor = 'rgba(45,212,191,0.5)'}
            onMouseOut={e => e.currentTarget.style.borderColor = 'rgba(45,212,191,0.2)'}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="Avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              user?.name?.[0]?.toUpperCase() || "?"
            )}
            {/* Camera overlay */}
            <div style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: 0, transition: "opacity 0.15s", borderRadius: "50%",
            }}
            onMouseOver={e => e.currentTarget.style.opacity = '1'}
            onMouseOut={e => e.currentTarget.style.opacity = '0'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) uploadAvatar(file);
              e.target.value = '';
            }}
          />
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: "0 0 4px" }}>
              Foto de Perfil
            </p>
            <p style={{ fontSize: 12, color: "#888", margin: "0 0 8px" }}>
              Clique na foto para alterar
            </p>
            {uploading && (
              <span style={{ fontSize: 12, color: "#2DD4BF" }}>Enviando...</span>
            )}
          </div>
        </div>

        <div className="grid-responsive" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Nome</label>
            <input style={inputStyle} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Telefone</label>
            <input style={inputStyle} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Email</label>
          <input style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} value={user.email} disabled />
          <p style={{ fontSize: 11, color: "#555", marginTop: 4 }}>O email não pode ser alterado.</p>
        </div>

        <button onClick={saveProfile} disabled={saving} style={btnPrimaryStyle}>
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
            <input type="password" style={inputStyle} value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Nova Senha</label>
            <input type="password" style={inputStyle} value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Confirmar Nova Senha</label>
            <input type="password" style={inputStyle} value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} />
          </div>
        </div>

        <button
          onClick={changePassword}
          disabled={changingPw || !pwForm.currentPassword || !pwForm.newPassword}
          style={{ ...btnPrimaryStyle, background: "none", border: "1px solid rgba(255,255,255,0.1)", color: "#ccc" }}
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
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
