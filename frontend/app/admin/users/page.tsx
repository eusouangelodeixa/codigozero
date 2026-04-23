"use client";
import { useState, useEffect, useCallback } from "react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

export default function AdminUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<any>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    fetch(`${API}/api/admin/users?${params}`, { headers: hdr() })
      .then(r => r.json())
      .then(data => { setUsers(data.users || []); setTotal(data.total || 0); });
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const handleSave = async () => {
    if (!editing) return;
    await fetch(`${API}/api/admin/users/${editing.id}`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify(editing),
    });
    showToast("Usuário atualizado ✓");
    setEditing(null);
    load();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remover "${name}"? Esta ação não pode ser desfeita.`)) return;
    await fetch(`${API}/api/admin/users/${id}`, { method: "DELETE", headers: hdr() });
    showToast("Usuário removido ✓");
    load();
  };

  const toggleActive = async (user: any) => {
    await fetch(`${API}/api/admin/users/${user.id}`, {
      method: "PATCH", headers: hdr(),
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    showToast(user.isActive ? "Usuário desativado" : "Usuário ativado");
    load();
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { active: styles.badgeGreen, lead: styles.badgeYellow, canceled: styles.badgeRed, overdue: styles.badgeRed, grace_period: styles.badgeYellow };
    return <span className={`${styles.badge} ${map[s] || styles.badgeGray}`}>{s}</span>;
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Gestão de Usuários</h1>
        <p className={styles.pageDesc}>{total} usuários no sistema</p>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.tableToolbar}>
          <input className={styles.tableSearch} placeholder="Buscar por nome ou email..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <table className={styles.table}>
          <thead>
            <tr><th>Nome</th><th>Email</th><th>Role</th><th>Status</th><th>Ativo</th><th>Criado</th><th>Ações</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td><span className={`${styles.badge} ${u.role === "admin" ? styles.badgeTeal : styles.badgeGray}`}>{u.role}</span></td>
                <td>{statusBadge(u.subscriptionStatus)}</td>
                <td>{u.isActive ? "✅" : "❌"}</td>
                <td>{new Date(u.createdAt).toLocaleDateString("pt-BR")}</td>
                <td>
                  <div className={styles.actions}>
                    <button className={styles.actionBtn} onClick={() => setEditing({ ...u })}>Editar</button>
                    <button className={styles.actionBtn} onClick={() => toggleActive(u)}>{u.isActive ? "Desativar" : "Ativar"}</button>
                    <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => handleDelete(u.id, u.name)}>Remover</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className={styles.modalOverlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Editar Usuário</h2>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nome</label>
                <input className={styles.formInput} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email</label>
                <input className={styles.formInput} value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Role</label>
                <select className={styles.formSelect} value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}>
                  <option value="member">Membro</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Status Assinatura</label>
                <select className={styles.formSelect} value={editing.subscriptionStatus} onChange={e => setEditing({ ...editing, subscriptionStatus: e.target.value })}>
                  <option value="active">Ativo</option>
                  <option value="lead">Lead</option>
                  <option value="grace_period">Período de Graça</option>
                  <option value="overdue">Atrasado</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Nova Senha (opcional)</label>
                <input className={styles.formInput} type="password" placeholder="Deixar vazio para manter" onChange={e => setEditing({ ...editing, password: e.target.value })} />
              </div>
            </div>
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} onClick={handleSave}>Salvar</button>
              <button className={styles.btnSecondary} onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
