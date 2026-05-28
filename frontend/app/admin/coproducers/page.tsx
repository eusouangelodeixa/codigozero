"use client";
import { useEffect, useState } from "react";
import { Handshake, Plus, Copy, ToggleLeft, ToggleRight, Trash2, Pencil, Check, X, ExternalLink } from "lucide-react";
import styles from "../admin.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

interface Coproducer {
  id: string;
  code: string;
  productPid: string;
  planId: string | null;
  publicCheckoutUrl: string | null;
  sharePct: number;
  bumpProductPid: string | null;
  bumpPrice: number | null;
  displayName: string | null;
  enabled: boolean;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string; phone: string };
  lifetimeRevenue: number;
  lifetimeSales: number;
  activeSubscribers: number;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);

export default function AdminCoproducers() {
  const [items, setItems] = useState<Coproducer[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPid, setFormPid] = useState("");
  const [formPlanId, setFormPlanId] = useState("");
  const [formCheckoutUrl, setFormCheckoutUrl] = useState("");
  const [formSharePct, setFormSharePct] = useState(50);
  const [formBumpPid, setFormBumpPid] = useState("");
  const [formBumpPrice, setFormBumpPrice] = useState<number | "">("");
  const [formDisplayName, setFormDisplayName] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // edit modal state
  const [editing, setEditing] = useState<Coproducer | null>(null);
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/admin/coproducers`, { headers: hdr() });
      const data = await r.json();
      setItems(data.coproducers || []);
    } catch {
      showToast("❌ Erro ao carregar");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!formEmail.trim() || !formPid.trim()) {
      showToast("❌ Email e PID são obrigatórios");
      return;
    }
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/admin/coproducers`, {
        method: "POST", headers: hdr(),
        body: JSON.stringify({
          userEmail: formEmail.trim(),
          productPid: formPid.trim(),
          planId: formPlanId.trim() || undefined,
          publicCheckoutUrl: formCheckoutUrl.trim() || undefined,
          sharePct: formSharePct,
          bumpProductPid: formBumpPid.trim() || undefined,
          bumpPrice: formBumpPrice === "" ? undefined : formBumpPrice,
          displayName: formDisplayName.trim() || undefined,
          notes: formNotes.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        showToast(`✅ Coprodutor criado (${data.code})`);
        setShowCreate(false);
        setFormEmail(""); setFormPid(""); setFormPlanId(""); setFormCheckoutUrl(""); setFormSharePct(50);
        setFormBumpPid(""); setFormBumpPrice("");
        setFormDisplayName(""); setFormNotes("");
        load();
      } else {
        showToast(`❌ ${data.error || "Erro ao criar"}`);
      }
    } catch {
      showToast("❌ Erro de conexão");
    }
    setCreating(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/coproducers/${editing.id}`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({
          productPid: editing.productPid,
          planId: editing.planId,
          publicCheckoutUrl: editing.publicCheckoutUrl,
          sharePct: editing.sharePct,
          bumpProductPid: editing.bumpProductPid || "",
          bumpPrice: editing.bumpPrice ?? "",
          displayName: editing.displayName,
          enabled: editing.enabled,
          notes: editing.notes,
        }),
      });
      if (r.ok) {
        showToast("✅ Atualizado");
        setEditing(null);
        load();
      } else {
        const data = await r.json();
        showToast(`❌ ${data.error || "Erro ao salvar"}`);
      }
    } catch { showToast("❌ Erro de conexão"); }
    setSaving(false);
  };

  const toggleEnabled = async (c: Coproducer) => {
    try {
      await fetch(`${API}/api/admin/coproducers/${c.id}`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({ enabled: !c.enabled }),
      });
      load();
    } catch {}
  };

  const remove = async (c: Coproducer) => {
    if (!confirm(`Remover ${c.displayName || c.user.name} da coprodução? O histórico fica preservado.`)) return;
    try {
      const r = await fetch(`${API}/api/admin/coproducers/${c.id}`, { method: "DELETE", headers: hdr() });
      if (r.ok) { showToast("🗑️ Removido"); load(); }
      else { const d = await r.json(); showToast(`❌ ${d.error}`); }
    } catch { showToast("❌ Erro de conexão"); }
  };

  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/c/${code}`;
    try { await navigator.clipboard.writeText(link); showToast("✅ Link copiado"); }
    catch { showToast(link); }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <span style={{ fontSize: 11, color: "#a855f7", fontWeight: 500, letterSpacing: 1, textTransform: "uppercase" }}>Parceiros</span>
          <h1 className={styles.pageTitle} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Handshake size={22} color="#a855f7" /> Coprodutores
          </h1>
          <p style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            Parceiros que vendem o Código Zero sob o próprio PID Lojou. {items.length} cadastrados.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "none", color: "#aaa", fontSize: 13, cursor: "pointer" }}>Atualizar</button>
          <button onClick={() => setShowCreate(true)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #a855f7, #7c3aed)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Plus size={14} /> Novo coprodutor</span>
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, padding: "10px 18px", background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#fff", fontSize: 13, zIndex: 200 }}>{toast}</div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: "#888" }}>Carregando…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#666" }}>
          <Handshake size={40} color="#666" style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 15, fontWeight: 500, color: "#aaa" }}>Nenhum coprodutor cadastrado</p>
          <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>O coprodutor precisa primeiro ter uma conta de membro no sistema (mesmo email).</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["", "Coprodutor", "PID Lojou", "Split", "Vendas (todos)", "Assinantes", "Link", "Ações"].map(h => (
                  <th key={h} style={{ padding: "10px 12px", fontSize: 11, color: "#888", fontWeight: 500, textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => toggleEnabled(c)} title={c.enabled ? "Desativar" : "Ativar"} style={{ background: "none", border: "none", cursor: "pointer", color: c.enabled ? "#22c55e" : "#666" }}>
                      {c.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                    </button>
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{c.displayName || c.user.name}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{c.user.email}</div>
                  </td>
                  <td style={{ padding: 12 }}>
                    <code style={{ fontSize: 12, padding: "3px 8px", background: "rgba(168,85,247,0.1)", color: "#a855f7", borderRadius: 4, fontFamily: "monospace" }}>{c.productPid}</code>
                  </td>
                  <td style={{ padding: 12, color: "#aaa", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{c.sharePct}%</td>
                  <td style={{ padding: 12 }}>
                    <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>{fmtMoney(c.lifetimeRevenue)}</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{c.lifetimeSales} vendas</div>
                  </td>
                  <td style={{ padding: 12, fontSize: 13, color: "#aaa", fontVariantNumeric: "tabular-nums" }}>{c.activeSubscribers}</td>
                  <td style={{ padding: 12 }}>
                    <button onClick={() => copyLink(c.code)} title="Copiar link" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", color: "#aaa", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>
                      <Copy size={11} /> /c/{c.code}
                    </button>
                  </td>
                  <td style={{ padding: 12 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <a href={`/c/${c.code}`} target="_blank" rel="noopener noreferrer" title="Abrir landing" style={{ padding: 6, color: "#888", borderRadius: 6 }}><ExternalLink size={14} /></a>
                      <button onClick={() => setEditing(c)} title="Editar" style={{ background: "none", border: "none", color: "#888", cursor: "pointer", padding: 6 }}><Pencil size={14} /></button>
                      <button onClick={() => remove(c)} title="Remover" style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", padding: 6 }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24, maxWidth: 520, width: "100%", maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <Handshake size={18} color="#a855f7" /> Novo coprodutor
            </h3>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>
              O coprodutor precisa primeiro existir como membro no sistema (mesmo email).
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Email do membro existente *" value={formEmail} onChange={setFormEmail} placeholder="email@example.com" />
              <Field label="PID Lojou do produto dele *" value={formPid} onChange={setFormPid} placeholder="Ex: abc123" hint="O webhook usa este PID pra atribuir as vendas a ele." />
              <Field label="Plan ID Lojou (opcional)" value={formPlanId} onChange={setFormPlanId} placeholder="Ex: nrUnJ" />
              <Field label="URL pública do checkout (opcional)" value={formCheckoutUrl} onChange={setFormCheckoutUrl} placeholder="https://pay.lojou.app/p/abc123" hint="Usada como fallback quando a API do Lojou falhar." />
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Split do coprodutor (%) — documentação</label>
                <input className={styles.formInput} type="number" min={0} max={100} value={formSharePct} onChange={(e) => setFormSharePct(parseFloat(e.target.value) || 0)} />
              </div>

              {/* ── Order bump per coprodutor (opcional) ── */}
              <div style={{ padding: 12, background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.18)", borderRadius: 8, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#a855f7", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Order bump (opcional)
                </div>
                <p style={{ fontSize: 11, color: "#888", margin: 0 }}>
                  Se este coprodutor tem um bump próprio na Lojou (com pid separado), informe abaixo. Sem isso, ele usa o bump principal do sistema.
                </p>
                <Field label="PID do bump na Lojou" value={formBumpPid} onChange={setFormBumpPid} placeholder="Ex: JQQWc" />
                <div>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Preço do bump (MZN)</label>
                  <input className={styles.formInput} type="number" min={0} step={1} value={formBumpPrice} onChange={(e) => setFormBumpPrice(e.target.value === "" ? "" : (parseFloat(e.target.value) || 0))} placeholder="Ex: 1297" />
                </div>
              </div>

              <Field label="Nome de exibição (opcional)" value={formDisplayName} onChange={setFormDisplayName} placeholder="Sobrescreve o nome do membro nas listas" />
              <Field label="Notas internas (opcional)" value={formNotes} onChange={setFormNotes} placeholder="Contrato, observações…" multiline />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#888", cursor: "pointer" }}>Cancelar</button>
              <button onClick={create} disabled={creating} style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg, #a855f7, #7c3aed)", border: "none", color: "#fff", cursor: creating ? "wait" : "pointer", opacity: creating ? 0.7 : 1 }}>
                {creating ? "Criando…" : "Criar coprodutor"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24, maxWidth: 520, width: "100%", maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Editar coprodutor</h3>
            <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{editing.user.email}</p>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="PID Lojou" value={editing.productPid} onChange={(v) => setEditing({ ...editing, productPid: v })} />
              <Field label="Plan ID Lojou" value={editing.planId || ""} onChange={(v) => setEditing({ ...editing, planId: v || null })} />
              <Field label="URL pública do checkout" value={editing.publicCheckoutUrl || ""} onChange={(v) => setEditing({ ...editing, publicCheckoutUrl: v || null })} />
              <div>
                <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Split (%)</label>
                <input className={styles.formInput} type="number" min={0} max={100} value={editing.sharePct} onChange={(e) => setEditing({ ...editing, sharePct: parseFloat(e.target.value) || 0 })} />
              </div>

              <div style={{ padding: 12, background: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.18)", borderRadius: 8, display: "grid", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#a855f7", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Order bump
                </div>
                <Field label="PID do bump na Lojou" value={editing.bumpProductPid || ""} onChange={(v) => setEditing({ ...editing, bumpProductPid: v || null })} placeholder="Vazio = sem bump próprio" />
                <div>
                  <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Preço do bump (MZN)</label>
                  <input className={styles.formInput} type="number" min={0} step={1} value={editing.bumpPrice ?? ""} onChange={(e) => setEditing({ ...editing, bumpPrice: e.target.value === "" ? null : (parseFloat(e.target.value) || 0) })} placeholder="Ex: 1297" />
                </div>
              </div>

              <Field label="Nome de exibição" value={editing.displayName || ""} onChange={(v) => setEditing({ ...editing, displayName: v || null })} />
              <Field label="Notas internas" value={editing.notes || ""} onChange={(v) => setEditing({ ...editing, notes: v || null })} multiline />
              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#aaa", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
                Conta ativa
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setEditing(null)} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, background: "none", border: "1px solid rgba(255,255,255,0.08)", color: "#888", cursor: "pointer" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><X size={13} /> Cancelar</span>
              </button>
              <button onClick={saveEdit} disabled={saving} style={{ padding: "9px 22px", borderRadius: 8, fontSize: 13, fontWeight: 700, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", color: "#fff", cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Check size={13} /> {saving ? "Salvando…" : "Salvar"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      {multiline ? (
        <textarea className={styles.formInput} style={{ minHeight: 70 }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input className={styles.formInput} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
      {hint && <span style={{ fontSize: 10, color: "#555", marginTop: 4, display: "block" }}>{hint}</span>}
    </div>
  );
}
