"use client";
import { useState, useEffect } from "react";
import styles from "../admin.module.css";

const I = ({ d, size = 16, color = "currentColor" }: { d: string; size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const icons = {
  ticket: "M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z",
  plus: "M12 4v16m8-8H4",
  refresh: "M4 4v5h5M20 20v-5h-5M5 13a7 7 0 0112.9-3.7M19 11a7 7 0 01-12.9 3.7",
  check: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  pause: "M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z",
  edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
  send: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  link: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  gift: "M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7",
  warn: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
  box: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  maxUses: number;
  usesCount: number;
  active: boolean;
  lojouId?: string | null;
  linkedUserId?: string | null;
  linkedUserEmail?: string | null;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  // Create form
  const [formCode, setFormCode] = useState("");
  const [formType, setFormType] = useState("percentage");
  const [formValue, setFormValue] = useState(10);
  const [formMaxUses, setFormMaxUses] = useState(1);
  const [formLinkedUserId, setFormLinkedUserId] = useState("");
  const [linkUsers, setLinkUsers] = useState<User[]>([]);
  const [linkSearch, setLinkSearch] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Send modal
  const [sendModal, setSendModal] = useState<{ code: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [sendingCoupon, setSendingCoupon] = useState(false);
  const [searchUser, setSearchUser] = useState("");

  const [apiError, setApiError] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const loadCoupons = async () => {
    setLoading(true);
    setApiError("");
    try {
      const res = await fetch(`${API}/api/admin/cupons`, { headers: hdr() });
      const data = await res.json();
      if (data.error) setApiError(data.error);
      setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
    } catch { setCoupons([]); setApiError("Erro de conexão com o servidor"); }
    setLoading(false);
  };

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API}/api/admin/users?limit=500`, { headers: hdr() });
      const data = await res.json();
      setUsers(data.users || []);
    } catch {}
  };

  useEffect(() => { loadCoupons(); }, []);

  const handleCreate = async () => {
    if (!formCode.trim()) return showToast("❌ Código obrigatório");
    if (!formValue || formValue <= 0) return showToast("❌ Valor inválido");

    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/cupons`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ code: formCode.toUpperCase().trim(), type: formType, value: formValue, max_uses: formMaxUses, active: formActive }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("✅ Cupom criado com sucesso!");
        setShowCreate(false);
        resetForm();
        loadCoupons();
      } else {
        showToast(`❌ ${data.error || "Erro ao criar"}`);
      }
    } catch { showToast("❌ Erro de conexão"); }
    setSaving(false);
  };

  const handleUpdate = async (id: string | number) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/admin/cupons/${id}`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({ code: formCode.toUpperCase().trim(), type: formType, value: formValue, max_uses: formMaxUses, active: formActive }),
      });
      if (res.ok) {
        showToast("✅ Cupom atualizado!");
        setEditingId(null);
        setShowCreate(false);
        resetForm();
        loadCoupons();
      } else {
        const data = await res.json();
        showToast(`❌ ${data.error || "Erro ao atualizar"}`);
      }
    } catch { showToast("❌ Erro de conexão"); }
    setSaving(false);
  };

  const handleDelete = async (id: string | number, code: string) => {
    if (!confirm(`Tem certeza que deseja excluir o cupom "${code}"?`)) return;
    try {
      const res = await fetch(`${API}/api/admin/cupons/${id}`, { method: "DELETE", headers: hdr() });
      if (res.ok) { showToast("🗑️ Cupom excluído"); loadCoupons(); }
      else showToast("❌ Erro ao excluir");
    } catch { showToast("❌ Erro de conexão"); }
  };

  const handleToggle = async (coupon: Coupon) => {
    try {
      await fetch(`${API}/api/admin/cupons/${coupon.id}`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({ active: !coupon.active }),
      });
      loadCoupons();
    } catch {}
  };

  const handleSendCoupon = async () => {
    if (!selectedUserId || !sendModal) return;
    setSendingCoupon(true);
    try {
      const res = await fetch(`${API}/api/admin/cupons/send`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({ couponCode: sendModal.code, userId: selectedUserId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ ${data.message || "Cupom enviado!"}`);
        setSendModal(null);
        setSelectedUserId("");
      } else {
        showToast(`❌ ${data.error || "Erro ao enviar"}`);
      }
    } catch { showToast("❌ Erro de conexão"); }
    setSendingCoupon(false);
  };

  const startEdit = (c: Coupon) => {
    setEditingId(c.id);
    setFormCode(c.code);
    setFormType(c.type || "percentage");
    setFormValue(c.value);
    setFormMaxUses(c.maxUses || 1);
    setFormActive(c.active);
    setFormLinkedUserId(c.linkedUserId || "");
    setShowCreate(true);
  };

  const openSendModal = (code: string) => {
    setSendModal({ code });
    setSelectedUserId("");
    setSearchUser("");
    if (users.length === 0) loadUsers();
  };

  const resetForm = () => {
    setFormCode(""); setFormType("percentage"); setFormValue(10); setFormMaxUses(1); setFormActive(true); setEditingId(null); setFormLinkedUserId("");
  };

  const filteredUsers = searchUser
    ? users.filter(u => u.name.toLowerCase().includes(searchUser.toLowerCase()) || u.email.toLowerCase().includes(searchUser.toLowerCase()))
    : users;

  const activeCoupons = coupons.filter(c => c.active);
  const inactiveCoupons = coupons.filter(c => !c.active);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 500, letterSpacing: 1, textTransform: "uppercase" }}>Gestão</span>
          <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: 10 }}><I d={icons.ticket} size={22} color="#f59e0b" /> Cupons de Desconto</h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            Gerencie cupons vinculados ao produto Código Zero. {coupons.length} cupons encontrados.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={loadCoupons} style={{
            padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
            background: "none", color: "#aaa", fontSize: 13, cursor: "pointer",
          }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><I d={icons.refresh} size={14} /> Atualizar</span></button>
          <button onClick={() => { setShowCreate(true); setEditingId(null); resetForm(); }} style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#0A0A0A",
            fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
          }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><I d={icons.plus} size={14} /> Novo Cupom</span></button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total", value: coupons.length, icon: icons.ticket, color: "#f59e0b" },
          { label: "Ativos", value: activeCoupons.length, icon: icons.check, color: "#22c55e" },
          { label: "Inativos", value: inactiveCoupons.length, icon: icons.pause, color: "#888" },
        ].map((s, i) => (
          <div key={i} className={styles.statCard} style={{ textAlign: "center", padding: 16 }}>
            <I d={s.icon} size={20} color={s.color} />
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#888" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* API Error Banner */}
      {apiError && (
        <div style={{
          padding: "14px 18px", borderRadius: 10, marginBottom: 20,
          background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
        }}>
          <p style={{ fontSize: 13, color: "#ef4444", fontWeight: 600, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><I d={icons.warn} size={15} color="#ef4444" /> Erro ao comunicar com a Lojou</p>
          <p style={{ fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>{apiError}</p>
          <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
            Verifique os scopes da API key no painel da Lojou. É necessário: <strong>discounts.read</strong> e <strong>discounts.write</strong>
          </p>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28, maxWidth: 440, width: "100%" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 20 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><I d={editingId ? icons.edit : icons.ticket} size={18} color="#f59e0b" /> {editingId ? "Editar Cupom" : "Novo Cupom"}</span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Código do Cupom</label>
                <input className={styles.formInput} value={formCode} onChange={e => setFormCode(e.target.value.toUpperCase())}
                  placeholder="Ex: DESCONTO10" style={{ textTransform: "uppercase" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Tipo</label>
                  <select className={styles.formInput} value={formType} onChange={e => setFormType(e.target.value)}>
                    <option value="percentage">Percentual (%)</option>
                    <option value="fixed">Valor Fixo (MT)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>
                    Valor ({formType === "percentage" ? "%" : "MT"})
                  </label>
                  <input className={styles.formInput} type="number" min={1}
                    value={formValue} onChange={e => setFormValue(parseInt(e.target.value) || 0)} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Usos Máximos</label>
                  <input className={styles.formInput} type="number" min={1}
                    value={formMaxUses} onChange={e => setFormMaxUses(parseInt(e.target.value) || 1)} />
                  <span style={{ fontSize: 10, color: "#666", marginTop: 2, display: "block" }}>1 = exclusivo para 1 pessoa</span>
                </div>
                <div style={{ flex: 1, display: "flex", alignItems: "center", paddingTop: 16 }}>
                  <label style={{
                    display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                    padding: "8px 12px", borderRadius: 8,
                    background: formActive ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${formActive ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                    fontSize: 13, color: formActive ? "#22c55e" : "#888",
                  }}>
                    <input type="checkbox" checked={formActive} onChange={e => setFormActive(e.target.checked)} style={{ accentColor: "#22c55e" }} />
                    {formActive ? "Ativo" : "Inativo"}
                  </label>
                </div>
              </div>

              <div style={{ padding: 10, borderRadius: 8, background: "rgba(245,158,11,0.04)", border: "1px solid rgba(245,158,11,0.1)", fontSize: 11, color: "#f59e0b", display: "flex", alignItems: "center", gap: 6 }}>
                <I d={icons.box} size={14} color="#f59e0b" /> Vinculado ao produto: <strong>Código Zero</strong> (PID: uoEHz)
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => { setShowCreate(false); resetForm(); }} style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, background: "none",
                border: "1px solid rgba(255,255,255,0.08)", color: "#888", cursor: "pointer",
              }}>Cancelar</button>
              <button onClick={() => editingId ? handleUpdate(editingId) : handleCreate()} disabled={saving} style={{
                padding: "8px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "linear-gradient(135deg, #f59e0b, #d97706)", border: "none",
                color: "#0A0A0A", cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1,
              }}>{saving ? "Salvando..." : editingId ? "Salvar" : "Criar Cupom"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {sendModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28, maxWidth: 440, width: "100%" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}><I d={icons.send} size={18} color="#22c55e" /> Enviar Cupom via WhatsApp</h3>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
              Cupom: <strong style={{ color: "#f59e0b", fontFamily: "monospace", letterSpacing: 1 }}>{sendModal.code}</strong>
            </p>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, color: "#888", display: "block", marginBottom: 4 }}>Buscar Usuário</label>
              <input className={styles.formInput} value={searchUser} onChange={e => setSearchUser(e.target.value)}
                placeholder="Nome ou email..." />
            </div>

            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 8, marginBottom: 16 }}>
              {filteredUsers.length === 0 ? (
                <p style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#666" }}>
                  {users.length === 0 ? "Carregando usuários..." : "Nenhum resultado"}
                </p>
              ) : filteredUsers.slice(0, 20).map(u => (
                <button key={u.id} onClick={() => setSelectedUserId(u.id)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px",
                  border: "none", borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer",
                  background: selectedUserId === u.id ? "rgba(245,158,11,0.06)" : "transparent",
                  textAlign: "left", transition: "background 0.15s",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    background: selectedUserId === u.id ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.04)",
                    color: selectedUserId === u.id ? "#f59e0b" : "#888", fontSize: 11, fontWeight: 600,
                  }}>{u.name?.[0] || "?"}</div>
                  <div>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{u.email} · {u.phone}</div>
                  </div>
                  {selectedUserId === u.id && <span style={{ marginLeft: "auto", color: "#f59e0b", fontSize: 14 }}>✓</span>}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setSendModal(null)} style={{
                padding: "8px 18px", borderRadius: 8, fontSize: 13, background: "none",
                border: "1px solid rgba(255,255,255,0.08)", color: "#888", cursor: "pointer",
              }}>Cancelar</button>
              <button onClick={handleSendCoupon} disabled={sendingCoupon || !selectedUserId} style={{
                padding: "8px 22px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: selectedUserId ? "linear-gradient(135deg, #22c55e, #16a34a)" : "rgba(255,255,255,0.04)",
                border: "none", color: selectedUserId ? "#fff" : "#666",
                cursor: !selectedUserId || sendingCoupon ? "not-allowed" : "pointer",
                opacity: sendingCoupon ? 0.7 : 1,
              }}><span style={{ display: "flex", alignItems: "center", gap: 6 }}><I d={icons.send} size={14} /> Enviar via WhatsApp</span></button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando cupons da Lojou...</div>
      ) : coupons.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#666" }}>
          <span style={{ display: "block", marginBottom: 12 }}><I d={icons.ticket} size={40} color="#666" /></span>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#aaa" }}>Nenhum cupom encontrado</p>
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Crie seu primeiro cupom de desconto.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Status", "Código", "Tipo", "Valor", "Usos", "Vinculado", "Criado em", "Ações"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", fontSize: 11, color: "#888", fontWeight: 500, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", transition: "background 0.15s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "12px" }}>
                    <button onClick={() => handleToggle(c)} style={{
                      padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600,
                      background: c.active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.04)",
                      color: c.active ? "#22c55e" : "#888",
                    }}>
                      {c.active ? "● Ativo" : "○ Inativo"}
                    </button>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{
                      padding: "4px 10px", borderRadius: 6, fontSize: 13, fontWeight: 600, fontFamily: "monospace",
                      background: "rgba(245,158,11,0.08)", color: "#f59e0b", letterSpacing: 1,
                    }}>{c.code}</span>
                  </td>
                  <td style={{ padding: "12px", fontSize: 12, color: "#aaa" }}>
                    {c.type === "percentage" ? "Percentual" : "Fixo"}
                  </td>
                  <td style={{ padding: "12px", fontSize: 14, fontWeight: 600, color: "#fff" }}>
                    {c.type === "percentage" ? `${c.value}%` : `${c.value} MT`}
                  </td>
                  <td style={{ padding: "12px", fontSize: 12, color: "#aaa" }}>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{c.usesCount || 0}</span>
                    <span style={{ color: "#666" }}> / {c.maxUses || "∞"}</span>
                  </td>
                  <td style={{ padding: "12px", fontSize: 11, color: "#aaa" }}>
                    {c.linkedUserEmail ? (
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(245,158,11,0.06)", color: "#f59e0b", fontSize: 10 }}>{c.linkedUserEmail}</span>
                    ) : (
                      <span style={{ color: "#666" }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "12px", fontSize: 11, color: "#666" }}>
                    {c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td style={{ padding: "12px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button onClick={() => openSendModal(c.code)} title="Enviar via WhatsApp"
                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(34,197,94,0.15)", background: "none", color: "#22c55e", fontSize: 11, cursor: "pointer" }}>
                        <I d={icons.send} size={13} color="#22c55e" />
                      </button>
                      <button onClick={() => startEdit(c)} title="Editar"
                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.06)", background: "none", color: "#aaa", fontSize: 11, cursor: "pointer" }}>
                        <I d={icons.edit} size={13} />
                      </button>
                      <button onClick={() => handleDelete(c.id, c.code)} title="Excluir"
                        style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.15)", background: "none", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>
                        <I d={icons.trash} size={13} color="#ef4444" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (() => {
        const isSuccess = toast.startsWith("✅");
        const isWarn = toast.startsWith("🗑️");
        const bg = isSuccess ? "rgba(45,212,191,0.12)" : isWarn ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
        const border = isSuccess ? "rgba(45,212,191,0.25)" : isWarn ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)";
        const color = isSuccess ? "#2DD4BF" : isWarn ? "#f59e0b" : "#ef4444";
        const icon = isSuccess ? icons.check : isWarn ? icons.trash : icons.warn;
        const text = toast.replace(/^[✅🗑️❌]\s*/, "");
        return (
          <div style={{
            position: "fixed", bottom: 24, right: 24, zIndex: 200,
            padding: "12px 20px", borderRadius: 10, display: "flex", alignItems: "center", gap: 8,
            background: bg, border: `1px solid ${border}`, color, fontSize: 13, fontWeight: 500,
            backdropFilter: "blur(12px)",
          }}><I d={icon} size={16} color={color} /> {text}</div>
        );
      })()}
    </div>
  );
}
