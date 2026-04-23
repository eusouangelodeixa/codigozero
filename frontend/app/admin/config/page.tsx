"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminConfig() {
  const [config, setConfig] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    fetch(`${API}/api/admin/system`, { headers: hdr() })
      .then(r => r.json()).then(d => setConfig(d.config || {}));
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const save = async () => {
    setSaving(true);
    await fetch(`${API}/api/admin/system`, {
      method: "PATCH", headers: hdr(), body: JSON.stringify(config),
    });
    setSaving(false);
    showToast("Configurações salvas ✓");
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Configurações do Sistema</h1>
        <p className={styles.pageDesc}>Controle de vagas, comunidade e mentorias</p>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>👥 Capacidade</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Máximo de Usuários</label>
            <input
              className={styles.formInput}
              type="number"
              value={config.maxUsers || 50}
              onChange={e => setConfig({ ...config, maxUsers: parseInt(e.target.value) || 50 })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Usuários Atuais</label>
            <input className={styles.formInput} type="number" value={config.currentUsers || 0} disabled />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>💬 Comunidade</h3>
        <div className={styles.formGroup}>
          <label className={styles.formLabel}>Link do Discord / Grupo</label>
          <input
            className={styles.formInput}
            placeholder="https://discord.gg/..."
            value={config.communityLink || ""}
            onChange={e => setConfig({ ...config, communityLink: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>📅 Próxima Mentoria</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Data e Hora</label>
            <input
              className={styles.formInput}
              type="datetime-local"
              value={config.mentoriaSchedule ? config.mentoriaSchedule.slice(0, 16) : ""}
              onChange={e => setConfig({ ...config, mentoriaSchedule: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Link da Reunião</label>
            <input
              className={styles.formInput}
              placeholder="https://meet.google.com/..."
              value={config.mentoriaLink || ""}
              onChange={e => setConfig({ ...config, mentoriaLink: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className={styles.btnRow}>
        <button className={styles.btnPrimary} onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar Configurações"}
        </button>
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
