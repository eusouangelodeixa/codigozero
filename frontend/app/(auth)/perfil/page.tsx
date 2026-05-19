"use client";
import { useEffect, useRef, useState } from "react";
import { PageHeader, Card, Button, Input, useToast } from "@/components/ui";
import styles from "./perfil.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface UserData {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  role?: string;
}

const CameraIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

export default function PerfilPage() {
  const toast = useToast();
  const [user, setUser] = useState<UserData | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", avatarUrl: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hdr = () => ({
    Authorization: `Bearer ${localStorage.getItem("cz_token")}`,
    "Content-Type": "application/json",
  });

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
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
    ? form.avatarUrl.startsWith("/")
      ? `${API}${form.avatarUrl}`
      : form.avatarUrl
    : null;

  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await fetch(`${API}/api/auth/avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("cz_token")}` },
        body: fd,
      });
      const data = await res.json();
      if (res.ok) {
        setForm((f) => ({ ...f, avatarUrl: data.avatarUrl }));
        setUser((u) => ({ ...(u || {}), avatarUrl: data.avatarUrl }));
        localStorage.setItem("cz_user", JSON.stringify({ ...(user || {}), avatarUrl: data.avatarUrl }));
        toast.success("Foto atualizada");
      } else {
        toast.error("Falha no upload", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setUploading(false);
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/auth/profile`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({ name: form.name, phone: form.phone }),
      });
      const data = await res.json();
      if (res.ok) {
        setUser((u) => ({ ...(u || {}), ...data.user }));
        localStorage.setItem("cz_user", JSON.stringify({ ...(user || {}), ...data.user }));
        toast.success("Perfil atualizado");
      } else {
        toast.error("Falha ao salvar", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setSaving(false);
  };

  const changePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setChangingPw(true);
    try {
      const res = await fetch(`${API}/api/auth/password`, {
        method: "PATCH",
        headers: hdr(),
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Senha alterada");
        setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      } else {
        toast.error("Falha ao alterar", data.error);
      }
    } catch {
      toast.error("Erro de conexão");
    }
    setChangingPw(false);
  };

  if (!user) return null;

  const initial = (user.name?.[0] || "?").toUpperCase();

  return (
    <div className={styles.page}>
      <PageHeader
        label="Conta · Perfil"
        title="Meu perfil"
        description="Gerencie suas informações pessoais, foto e senha de acesso."
      />

      {/* ── Informações ── */}
      <Card padding="lg">
        <div className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>Informações pessoais</h2>
            <p className={styles.sectionSubtitle}>Visível na comunidade e no perfil.</p>
          </div>

          <div className={styles.avatarRow}>
            <button
              type="button"
              className={styles.avatarButton}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Trocar foto"
            >
              {avatarSrc ? <img src={avatarSrc} alt="" /> : initial}
              <span className={styles.avatarOverlay}>
                <CameraIcon size={20} />
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAvatar(file);
                e.target.value = "";
              }}
            />
            <div className={styles.avatarMeta}>
              <span className={styles.avatarMetaTitle}>Foto de perfil</span>
              <span className={styles.avatarMetaHint}>Clique para trocar (JPG, PNG, até 2 MB).</span>
              {uploading && <span className={styles.uploadingLabel}>Enviando…</span>}
            </div>
          </div>

          <div className={styles.fieldsGrid}>
            <Input
              label="Nome"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              label="Telefone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input
              label="E-mail"
              value={user.email || ""}
              disabled
              hint="O e-mail não pode ser alterado."
              className={styles.fullField}
            />
          </div>

          <div>
            <Button variant="primary" onClick={saveProfile} loading={saving}>
              Salvar alterações
            </Button>
          </div>
        </div>
      </Card>

      {/* ── Senha ── */}
      <Card padding="lg">
        <div className={styles.section}>
          <div>
            <h2 className={styles.sectionTitle}>Alterar senha</h2>
            <p className={styles.sectionSubtitle}>Use uma senha forte e única para esta conta.</p>
          </div>

          <Input
            label="Senha atual"
            type="password"
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))}
          />
          <Input
            label="Nova senha"
            type="password"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            value={pwForm.confirmPassword}
            onChange={(e) => setPwForm((p) => ({ ...p, confirmPassword: e.target.value }))}
            error={
              pwForm.confirmPassword && pwForm.confirmPassword !== pwForm.newPassword
                ? "As senhas não coincidem."
                : undefined
            }
          />

          <div>
            <Button
              variant="secondary"
              onClick={changePassword}
              loading={changingPw}
              disabled={!pwForm.currentPassword || !pwForm.newPassword}
            >
              Alterar senha
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
