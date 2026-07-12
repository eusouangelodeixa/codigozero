"use client";
import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  SegmentedControl,
  RowActions,
  type Column,
  type RowAction,
} from "@/components/admin";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

const fmt = (n: number) => n.toLocaleString("pt-BR");

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

interface Metrics {
  active: number;
  totalUses: number;
}

/** Linha de seleção de destinatário (membro/lead) no modal de envio. */
function PickRow({ selected, onClick, name, sub }: { selected: boolean; onClick: () => void; name: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px",
        border: "none", borderBottom: "1px solid var(--border-subtle)", cursor: "pointer",
        textAlign: "left", background: selected ? "var(--accent-dim)" : "transparent",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{name}</div>
        <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
      {selected && <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>}
    </button>
  );
}

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [apiError, setApiError] = useState("");

  // Paginação server-driven
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  // Create/edit form
  const [formCode, setFormCode] = useState("");
  const [formType, setFormType] = useState("percentage");
  const [formValue, setFormValue] = useState(10);
  const [formMaxUses, setFormMaxUses] = useState(1);
  const [formLinkedUserId, setFormLinkedUserId] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Send modal — três abas (membro/lead/manual) + preview ao vivo
  const [sendModal, setSendModal] = useState<{ code: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [leads, setLeads] = useState<User[]>([]);
  const [sendingCoupon, setSendingCoupon] = useState(false);

  type RecipientTab = "user" | "lead" | "manual";
  const [recipientTab, setRecipientTab] = useState<RecipientTab>("user");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [searchUser, setSearchUser] = useState("");
  const [searchLead, setSearchLead] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");

  const DEFAULT_MSG = [
    "Olá {{nome}}! 🎉",
    "",
    "Tenho um presente para você entrar no Código Zero:",
    "",
    "🎟️ *Cupom:* {{cupom}}  ({{desconto}})",
    "",
    "O link já abre o checkout com o cupom aplicado — basta confirmar:",
    "🔗 {{link}}",
    "",
    "🚀 Aproveite — esse cupom é só seu.",
  ].join("\n");
  const [messageBody, setMessageBody] = useState(DEFAULT_MSG);
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRef = useRef<HTMLTextAreaElement | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const loadCoupons = useCallback(() => {
    setLoading(true);
    setApiError("");
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    fetch(`${API}/api/admin/cupons?${p}`, { headers: hdr() })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setApiError(data.error);
        setCoupons(Array.isArray(data.items) ? data.items : Array.isArray(data.coupons) ? data.coupons : []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.metrics) setMetrics(data.metrics);
      })
      .catch(() => { setCoupons([]); setApiError("Erro de conexão com o servidor"); })
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => { loadCoupons(); }, [loadCoupons]);

  const loadUsers = async () => {
    try {
      const res = await fetch(`${API}/api/admin/users?pageSize=100`, { headers: hdr() });
      const data = await res.json();
      setUsers(data.users || []);
    } catch {}
  };

  const loadLeads = async () => {
    try {
      // Leads endpoint suporta `filter=unpaid` (subscriptionStatus='lead'); paginado (máx 100/pág).
      const res = await fetch(`${API}/api/admin/leads?filter=unpaid&pageSize=100`, { headers: hdr() });
      const data = await res.json();
      setLeads(Array.isArray(data.leads) ? data.leads : Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : []);
    } catch {}
  };

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
        setPage(1);
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

  // Monta o payload do destinatário a partir da aba ativa.
  const buildRecipient = useCallback(() => {
    if (recipientTab === "user") {
      if (!selectedUserId) return null;
      return { type: "user" as const, userId: selectedUserId };
    }
    if (recipientTab === "lead") {
      if (!selectedLeadId) return null;
      return { type: "lead" as const, leadId: selectedLeadId };
    }
    if (!manualName.trim() || !manualPhone.trim()) return null;
    return {
      type: "manual" as const,
      name: manualName.trim(),
      phone: manualPhone.trim(),
      ...(manualEmail.trim() ? { email: manualEmail.trim() } : {}),
    };
  }, [recipientTab, selectedUserId, selectedLeadId, manualName, manualPhone, manualEmail]);

  // Preview ao vivo (debounced) contra o backend — resolve {{nome}}/{{cupom}}/
  // {{link}}/{{desconto}} exatamente como o endpoint de envio faz.
  const requestPreview = useCallback(() => {
    if (!sendModal) return;
    const recipient = buildRecipient();
    if (!recipient) { setPreviewText(""); return; }
    setPreviewLoading(true);
    fetch(`${API}/api/admin/cupons/preview`, {
      method: "POST",
      headers: hdr(),
      body: JSON.stringify({ couponCode: sendModal.code, recipient, message: messageBody }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.message) setPreviewText(data.message);
        else if (data?.error) setPreviewText(`(preview indisponível: ${data.error})`);
      })
      .catch(() => setPreviewText("(falha de conexão ao gerar preview)"))
      .finally(() => setPreviewLoading(false));
  }, [sendModal, buildRecipient, messageBody]);

  useEffect(() => {
    if (!sendModal) return;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(requestPreview, 400);
    return () => { if (previewTimer.current) clearTimeout(previewTimer.current); };
  }, [sendModal, requestPreview]);

  // Insere um placeholder na posição do cursor do textarea.
  const insertPlaceholder = (token: string) => {
    const el = messageRef.current;
    if (!el) { setMessageBody((m) => `${m}${token}`); return; }
    const start = el.selectionStart ?? messageBody.length;
    const end = el.selectionEnd ?? messageBody.length;
    const next = messageBody.slice(0, start) + token + messageBody.slice(end);
    setMessageBody(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleSendCoupon = async () => {
    if (!sendModal) return;
    const recipient = buildRecipient();
    if (!recipient) { showToast("❌ Preencha os dados do destinatário"); return; }
    setSendingCoupon(true);
    try {
      const res = await fetch(`${API}/api/admin/cupons/send`, {
        method: "POST",
        headers: hdr(),
        body: JSON.stringify({ couponCode: sendModal.code, recipient, message: messageBody }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`✅ Cupom enviado para ${data.sentTo?.name || "destinatário"}`);
        setSendModal(null);
        setSelectedUserId("");
        setSelectedLeadId("");
        setManualName("");
        setManualPhone("");
        setManualEmail("");
        setMessageBody(DEFAULT_MSG);
        setPreviewText("");
      } else {
        showToast(`❌ ${data.error || "Erro ao enviar"}`);
      }
    } catch {
      showToast("❌ Erro de conexão");
    }
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
    setRecipientTab("user");
    setSelectedUserId("");
    setSelectedLeadId("");
    setManualName("");
    setManualPhone("");
    setManualEmail("");
    setSearchUser("");
    setSearchLead("");
    setMessageBody(DEFAULT_MSG);
    setPreviewText("");
    if (users.length === 0) loadUsers();
    if (leads.length === 0) loadLeads();
  };

  const resetForm = () => {
    setFormCode(""); setFormType("percentage"); setFormValue(10); setFormMaxUses(1); setFormActive(true); setEditingId(null); setFormLinkedUserId("");
  };

  const filteredUsers = searchUser
    ? users.filter((u) => u.name.toLowerCase().includes(searchUser.toLowerCase()) || u.email.toLowerCase().includes(searchUser.toLowerCase()))
    : users;

  const columns: Column<Coupon>[] = [
    {
      key: "cupom", header: "Cupom", primaryOnMobile: true,
      render: (c) => (
        <div className={k.cellStack}>
          <span className={`${k.cellMain} ${k.cellMono}`}>{c.code}</span>
          <span className={k.cellSub}>{c.type === "percentage" ? "Percentual" : "Valor fixo"}</span>
        </div>
      ),
    },
    {
      key: "valor", header: "Valor", mobileLabel: "Valor",
      render: (c) => <strong>{c.type === "percentage" ? `${c.value}%` : `${c.value} MT`}</strong>,
    },
    {
      key: "usos", header: "Usos", mobileLabel: "Usos",
      render: (c) => (
        <span className={k.cellInline}>
          <strong>{c.usesCount || 0}</strong>
          <span className={k.cellMuted}>/ {c.maxUses || "∞"}</span>
        </span>
      ),
    },
    {
      key: "vinculado", header: "Vinculado", hideOnMobile: true,
      render: (c) => (c.linkedUserEmail ? <StatusBadge tone="accent" noDot>{c.linkedUserEmail}</StatusBadge> : <span className={k.cellMuted}>—</span>),
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (c) => <StatusBadge tone={c.active ? "good" : "neutral"} noDot>{c.active ? "Ativo" : "Inativo"}</StatusBadge>,
    },
    {
      key: "criado", header: "Criado", muted: true, hideOnMobile: true,
      render: (c) => (c.createdAt ? new Date(c.createdAt).toLocaleDateString("pt-BR") : "—"),
    },
  ];

  const rowActions = (c: Coupon): ReactNode => {
    const items: RowAction[] = [
      { label: "Enviar via WhatsApp", onClick: () => openSendModal(c.code) },
      { label: "Editar", onClick: () => startEdit(c) },
      { label: c.active ? "Desativar" : "Ativar", onClick: () => handleToggle(c) },
      { label: "Excluir", onClick: () => handleDelete(c.id, c.code), danger: true },
    ];
    return <RowActions items={items} />;
  };

  return (
    <>
      <AdminPage
        title="Cupons"
        actions={
          <>
            <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={loadCoupons}>Atualizar</button>
            <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={() => { setShowCreate(true); setEditingId(null); resetForm(); }}>
              ＋ Novo cupom
            </button>
          </>
        }
        kpis={
          <StatRow>
            <StatTile accent label="Ativos" loading={!metrics} value={metrics && fmt(metrics.active)} />
            <StatTile label="Usos totais" loading={!metrics} value={metrics && fmt(metrics.totalUses)} />
            <StatTile label="Total" loading={!metrics} value={metrics ? fmt(total) : undefined} />
          </StatRow>
        }
      >
        {apiError && (
          <div
            role="alert"
            style={{
              display: "flex", flexDirection: "column", gap: 4, marginBottom: "var(--space-4)",
              padding: "12px 16px", borderRadius: "var(--radius-md)",
              background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.28)",
            }}
          >
            <strong style={{ fontSize: 13, color: "var(--color-error)" }}>Erro ao comunicar com a Lojou</strong>
            <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{apiError}</span>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              Verifique os scopes da API key na Lojou: <strong>discounts.read</strong> e <strong>discounts.write</strong>.
            </span>
          </div>
        )}

        <DataTable
          columns={columns}
          rows={coupons}
          getRowKey={(c) => String(c.id)}
          loading={loading}
          empty={{ title: "Nenhum cupom encontrado", desc: "Crie seu primeiro cupom de desconto." }}
          rowActions={rowActions}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
        />
      </AdminPage>

      {/* Create/Edit Modal */}
      {showCreate && (
        <div className={a.modalOverlay} onClick={() => { setShowCreate(false); resetForm(); }}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <h2 className={a.modalTitle}>{editingId ? "Editar cupom" : "Novo cupom"}</h2>
            <div className={a.formGrid}>
              <div className={`${a.formGroup} ${a.formGroupFull}`}>
                <label className={a.formLabel}>Código do cupom</label>
                <input className={a.formInput} value={formCode} onChange={(e) => setFormCode(e.target.value.toUpperCase())} placeholder="Ex: DESCONTO10" style={{ textTransform: "uppercase" }} />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Tipo</label>
                <select className={a.formSelect} value={formType} onChange={(e) => setFormType(e.target.value)}>
                  <option value="percentage">Percentual (%)</option>
                  <option value="fixed">Valor fixo (MT)</option>
                </select>
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Valor ({formType === "percentage" ? "%" : "MT"})</label>
                <input className={a.formInput} type="number" min={1} value={formValue} onChange={(e) => setFormValue(parseInt(e.target.value) || 0)} />
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Usos máximos</label>
                <input className={a.formInput} type="number" min={1} value={formMaxUses} onChange={(e) => setFormMaxUses(parseInt(e.target.value) || 1)} />
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>1 = exclusivo para 1 pessoa</span>
              </div>
              <div className={a.formGroup}>
                <label className={a.formLabel}>Status</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", minHeight: 40 }}>
                  <input type="checkbox" checked={formActive} onChange={(e) => setFormActive(e.target.checked)} />
                  <span style={{ fontSize: 14, color: formActive ? "var(--color-success)" : "var(--text-tertiary)" }}>{formActive ? "Ativo" : "Inativo"}</span>
                </label>
              </div>
              <div
                className={a.formGroupFull}
                style={{
                  padding: "10px 12px", borderRadius: "var(--radius-md)", fontSize: 12,
                  background: "var(--accent-dim)", border: "1px solid var(--accent-border)", color: "var(--accent)",
                }}
              >
                Vinculado ao produto <strong>Código Zero</strong> (PID: uoEHz)
              </div>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={() => (editingId ? handleUpdate(editingId) : handleCreate())} disabled={saving}>
                {saving ? "Salvando…" : editingId ? "Salvar" : "Criar cupom"}
              </button>
              <button className={a.btnSecondary} onClick={() => { setShowCreate(false); resetForm(); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Send Modal */}
      {sendModal && (() => {
        const recipient = buildRecipient();
        const canSend = !!recipient;
        const filteredLeads = searchLead
          ? leads.filter(
              (l) =>
                (l.name || "").toLowerCase().includes(searchLead.toLowerCase()) ||
                (l.email || "").toLowerCase().includes(searchLead.toLowerCase()) ||
                (l.phone || "").includes(searchLead),
            )
          : leads;
        return (
          <div className={a.modalOverlay} onClick={() => setSendModal(null)}>
            <div className={a.modal} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
              <h2 className={a.modalTitle}>Enviar cupom via WhatsApp</h2>
              <p style={{ fontSize: 13, color: "var(--text-tertiary)", margin: "-8px 0 16px" }}>
                Cupom{" "}
                <strong style={{ color: "var(--accent)", fontFamily: "var(--font-mono)", letterSpacing: 1 }}>{sendModal.code}</strong>
                {" "}· o link enviado é o checkout normal já com o cupom aplicado.
              </p>

              <div style={{ marginBottom: 16 }}>
                <SegmentedControl<RecipientTab>
                  value={recipientTab}
                  onChange={setRecipientTab}
                  options={[
                    { value: "user", label: "Membro" },
                    { value: "lead", label: "Lead" },
                    { value: "manual", label: "Manual" },
                  ]}
                />
              </div>

              {recipientTab === "user" && (
                <>
                  <div className={a.formGroup} style={{ marginBottom: 10 }}>
                    <label className={a.formLabel}>Buscar membro</label>
                    <input className={a.formInput} value={searchUser} onChange={(e) => setSearchUser(e.target.value)} placeholder="Nome, e-mail ou telefone…" />
                  </div>
                  <div style={{ maxHeight: 190, overflowY: "auto", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", marginBottom: 16 }}>
                    {filteredUsers.length === 0 ? (
                      <p style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
                        {users.length === 0 ? "Carregando membros…" : "Nenhum resultado"}
                      </p>
                    ) : (
                      filteredUsers.map((u) => (
                        <PickRow key={u.id} selected={selectedUserId === u.id} onClick={() => setSelectedUserId(u.id)} name={u.name} sub={`${u.email} · ${u.phone}`} />
                      ))
                    )}
                  </div>
                </>
              )}

              {recipientTab === "lead" && (
                <>
                  <div className={a.formGroup} style={{ marginBottom: 10 }}>
                    <label className={a.formLabel}>Buscar lead (não assinantes)</label>
                    <input className={a.formInput} value={searchLead} onChange={(e) => setSearchLead(e.target.value)} placeholder="Nome, e-mail ou telefone…" />
                  </div>
                  <div style={{ maxHeight: 190, overflowY: "auto", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", marginBottom: 16 }}>
                    {filteredLeads.length === 0 ? (
                      <p style={{ padding: 16, textAlign: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
                        {leads.length === 0 ? "Carregando leads…" : "Nenhum lead encontrado"}
                      </p>
                    ) : (
                      filteredLeads.map((l) => (
                        <PickRow key={l.id} selected={selectedLeadId === l.id} onClick={() => setSelectedLeadId(l.id)} name={l.name || "(sem nome)"} sub={`${l.email} · ${l.phone}`} />
                      ))
                    )}
                  </div>
                </>
              )}

              {recipientTab === "manual" && (
                <div className={a.formGrid} style={{ marginBottom: 16 }}>
                  <div className={`${a.formGroup} ${a.formGroupFull}`}>
                    <label className={a.formLabel}>Nome *</label>
                    <input className={a.formInput} value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ex: Anderson Sevene" />
                  </div>
                  <div className={a.formGroup}>
                    <label className={a.formLabel}>WhatsApp *</label>
                    <input className={a.formInput} value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} placeholder="Ex: +258 84 123 4567" />
                  </div>
                  <div className={a.formGroup}>
                    <label className={a.formLabel}>E-mail (opcional)</label>
                    <input className={a.formInput} value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="Ex: anderson@email.com" />
                  </div>
                </div>
              )}

              {/* Editor de mensagem com chips de placeholder */}
              <div className={a.formGroup} style={{ marginBottom: 12 }}>
                <label className={a.formLabel}>Mensagem</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  {["{{nome}}", "{{cupom}}", "{{link}}", "{{desconto}}"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => insertPlaceholder(t)}
                      style={{
                        padding: "3px 9px", borderRadius: "var(--radius-full)", fontSize: 11, fontWeight: 600,
                        background: "var(--accent-dim)", border: "1px solid var(--accent-border)",
                        color: "var(--accent)", cursor: "pointer", fontFamily: "var(--font-mono)",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <textarea ref={messageRef} className={a.formTextarea} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} style={{ minHeight: 130 }} />
              </div>

              {/* Preview ao vivo */}
              <div className={a.formGroup} style={{ marginBottom: 16 }}>
                <label className={a.formLabel} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>Preview</span>
                  <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, fontSize: 11, color: "var(--text-tertiary)" }}>
                    {previewLoading ? "atualizando…" : "exatamente como vai chegar"}
                  </span>
                </label>
                <pre
                  style={{
                    margin: 0, padding: 12, background: "var(--bg-surface)",
                    border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)",
                    color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.55,
                    whiteSpace: "pre-wrap", fontFamily: "inherit", minHeight: 90,
                  }}
                >
                  {previewText || (canSend ? "(carregando preview…)" : "Selecione o destinatário para ver o preview.")}
                </pre>
              </div>

              <div className={a.btnRow}>
                <button className={a.btnPrimary} onClick={handleSendCoupon} disabled={sendingCoupon || !canSend}>
                  {sendingCoupon ? "Enviando…" : "Enviar via WhatsApp"}
                </button>
                <button className={a.btnSecondary} onClick={() => setSendModal(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && <div className={a.toast}>{toast}</div>}
    </>
  );
}
