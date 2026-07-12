"use client";
import { useState, useEffect, useCallback, type ReactNode } from "react";
import a from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import {
  AdminPage,
  StatRow,
  StatTile,
  DataTable,
  StatusBadge,
  RowActions,
  type Column,
  type RowAction,
} from "@/components/admin";

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
  updatedAt?: string;
  user: { id: string; name: string; email: string; phone: string };
  lifetimeRevenue: number;
  lifetimeSales: number;
  activeSubscribers: number;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("pt-MZ", { style: "currency", currency: "MZN", maximumFractionDigits: 0 }).format(n);
const fmt = (n: number) => n.toLocaleString("pt-BR");

export default function AdminCoproducers() {
  const [items, setItems] = useState<Coproducer[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 25;

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
  const [formVslEmbed, setFormVslEmbed] = useState("");
  const [formHeadScripts, setFormHeadScripts] = useState("");

  // edit modal state
  const [editing, setEditing] = useState<Coproducer | null>(null);
  const [editVsl, setEditVsl] = useState("");
  const [editHead, setEditHead] = useState("");
  const [saving, setSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const r = await fetch(`${API}/api/admin/coproducers?${p}`, { headers: hdr() });
      const data = await r.json();
      setItems(data.items || data.coproducers || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      showToast("Erro ao carregar");
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!formEmail.trim() || !formPid.trim()) {
      showToast("Email e PID são obrigatórios");
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
          vslEmbedHtml: formVslEmbed.trim() || undefined,
          headScripts: formHeadScripts.trim() || undefined,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        showToast(`Coprodutor criado (${data.code}) ✓`);
        setShowCreate(false);
        setFormEmail(""); setFormPid(""); setFormPlanId(""); setFormCheckoutUrl(""); setFormSharePct(50);
        setFormBumpPid(""); setFormBumpPrice("");
        setFormDisplayName(""); setFormNotes("");
        setFormVslEmbed(""); setFormHeadScripts("");
        setPage(1);
        load();
      } else {
        showToast(data.error || "Erro ao criar");
      }
    } catch {
      showToast("Erro de conexão");
    }
    setCreating(false);
  };

  const openEdit = (c: Coproducer) => {
    setEditing({ ...c });
    // A lista não retorna mais vslEmbedHtml/headScripts (payload enxuto). Sem
    // endpoint de detalhe, abrimos os campos vazios: em branco = manter o atual.
    setEditVsl("");
    setEditHead("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        productPid: editing.productPid,
        planId: editing.planId,
        publicCheckoutUrl: editing.publicCheckoutUrl,
        sharePct: editing.sharePct,
        bumpProductPid: editing.bumpProductPid || "",
        bumpPrice: editing.bumpPrice ?? "",
        displayName: editing.displayName,
        enabled: editing.enabled,
        notes: editing.notes,
      };
      // Só enviamos VSL/pixels quando o admin digita um novo valor — enviar ""
      // apagaria o conteúdo guardado (a lista não devolve mais esses campos).
      if (editVsl.trim()) body.vslEmbedHtml = editVsl;
      if (editHead.trim()) body.headScripts = editHead;

      const r = await fetch(`${API}/api/admin/coproducers/${editing.id}`, {
        method: "PATCH", headers: hdr(), body: JSON.stringify(body),
      });
      if (r.ok) {
        showToast("Atualizado ✓");
        setEditing(null);
        load();
      } else {
        const data = await r.json();
        showToast(data.error || "Erro ao salvar");
      }
    } catch { showToast("Erro de conexão"); }
    setSaving(false);
  };

  const toggleEnabled = async (c: Coproducer) => {
    try {
      await fetch(`${API}/api/admin/coproducers/${c.id}`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({ enabled: !c.enabled }),
      });
      load();
    } catch { showToast("Erro de conexão"); }
  };

  const remove = async (c: Coproducer) => {
    if (!confirm(`Remover ${c.displayName || c.user.name} da coprodução? O histórico fica preservado.`)) return;
    try {
      const r = await fetch(`${API}/api/admin/coproducers/${c.id}`, { method: "DELETE", headers: hdr() });
      if (r.ok) { showToast("Removido ✓"); load(); }
      else { const d = await r.json(); showToast(d.error || "Erro ao remover"); }
    } catch { showToast("Erro de conexão"); }
  };

  const copyLink = async (code: string) => {
    const link = `${window.location.origin}/c/${code}`;
    try { await navigator.clipboard.writeText(link); showToast("Link copiado ✓"); }
    catch { showToast(link); }
  };

  const openLanding = (code: string) => {
    if (typeof window !== "undefined") window.open(`${window.location.origin}/c/${code}`, "_blank", "noopener");
  };

  // KPIs — `total` é global (via paginação). Os demais agregam a página carregada:
  // este endpoint não expõe metrics{}, e a base de coprodutores cabe numa página.
  const activeCount = items.filter((c) => c.enabled).length;
  const revenueSum = items.reduce((s, c) => s + (c.lifetimeRevenue || 0), 0);
  const subsSum = items.reduce((s, c) => s + (c.activeSubscribers || 0), 0);

  const columns: Column<Coproducer>[] = [
    {
      key: "coprodutor", header: "Coprodutor", primaryOnMobile: true,
      render: (c) => (
        <div className={k.cellStack}>
          <span className={k.cellMain}>{c.displayName || c.user.name}</span>
          <span className={k.cellSub}>{c.user.email}</span>
        </div>
      ),
    },
    {
      key: "status", header: "Status", mobileLabel: "Status",
      render: (c) => (c.enabled ? <StatusBadge tone="good">Ativo</StatusBadge> : <StatusBadge tone="neutral" noDot>Inativo</StatusBadge>),
    },
    {
      key: "pid", header: "PID Lojou", mono: true, muted: true, hideOnMobile: true,
      render: (c) => c.productPid || "—",
    },
    {
      key: "split", header: "Split", align: "right", mono: true, mobileLabel: "Split",
      render: (c) => `${c.sharePct}%`,
    },
    {
      key: "vendas", header: "Vendas", align: "right", mobileLabel: "Vendas",
      render: (c) => (
        <div className={k.cellStack}>
          <span className={k.cellMain} style={{ fontVariantNumeric: "tabular-nums" }}>{fmtMoney(c.lifetimeRevenue)}</span>
          <span className={k.cellSub}>{fmt(c.lifetimeSales)} vendas</span>
        </div>
      ),
    },
    {
      key: "assinantes", header: "Assinantes", align: "right", mono: true, mobileLabel: "Assinantes",
      render: (c) => fmt(c.activeSubscribers),
    },
  ];

  const rowActions = (c: Coproducer): ReactNode => {
    const acts: RowAction[] = [
      { label: "Copiar link", onClick: () => copyLink(c.code) },
      { label: "Abrir landing", onClick: () => openLanding(c.code) },
      { label: "Editar", onClick: () => openEdit(c) },
      { label: c.enabled ? "Desativar" : "Ativar", onClick: () => toggleEnabled(c) },
      { label: "Remover", onClick: () => remove(c), danger: true },
    ];
    return <RowActions items={acts} />;
  };

  return (
    <>
      <AdminPage
        title="Coprodutores"
        actions={
          <>
            <button type="button" className={`${k.btn} ${k.btnSecondary}`} onClick={load} disabled={loading}>
              Atualizar
            </button>
            <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={() => setShowCreate(true)}>
              ＋ Novo coprodutor
            </button>
          </>
        }
        kpis={
          <StatRow>
            <StatTile accent label="Coprodutores" loading={loading} value={fmt(total)} />
            <StatTile label="Ativos" loading={loading} value={fmt(activeCount)} />
            <StatTile label="Faturamento" loading={loading} value={fmtMoney(revenueSum)} />
            <StatTile label="Assinantes" loading={loading} value={fmt(subsSum)} />
          </StatRow>
        }
      >
        <DataTable
          columns={columns}
          rows={items}
          getRowKey={(c) => c.id}
          loading={loading}
          empty={{
            title: "Nenhum coprodutor cadastrado",
            desc: "O coprodutor precisa primeiro ter uma conta de membro no sistema (mesmo email).",
          }}
          rowActions={rowActions}
          pagination={{ page, totalPages, total, pageSize, onChange: setPage }}
        />
      </AdminPage>

      {/* Create modal */}
      {showCreate && (
        <div className={a.modalOverlay} onClick={() => !creating && setShowCreate(false)}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>Novo coprodutor</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>
              O coprodutor precisa primeiro existir como membro no sistema (mesmo email).
            </p>
            <div className={a.formGrid} style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Email do membro existente *" value={formEmail} onChange={setFormEmail} placeholder="email@example.com" />
              <Field label="PID Lojou do produto dele *" value={formPid} onChange={setFormPid} placeholder="Ex: abc123" hint="O webhook usa este PID pra atribuir as vendas a ele." />
              <Field label="Plan ID Lojou (opcional)" value={formPlanId} onChange={setFormPlanId} placeholder="Ex: nrUnJ" />
              <Field label="URL pública do checkout (opcional)" value={formCheckoutUrl} onChange={setFormCheckoutUrl} placeholder="https://pay.lojou.app/p/abc123" hint="Usada como fallback quando a API do Lojou falhar." />
              <NumberField label="Split do coprodutor (%) — documentação" value={formSharePct} min={0} max={100} onChange={(v) => setFormSharePct(v === "" ? 0 : v)} />

              <SubBox title="Order bump (opcional)" desc="Se este coprodutor tem um bump próprio na Lojou (com pid separado), informe abaixo. Sem isso, ele usa o bump principal do sistema.">
                <Field label="PID do bump na Lojou" value={formBumpPid} onChange={setFormBumpPid} placeholder="Ex: JQQWc" />
                <NumberField label="Preço do bump (MZN)" value={formBumpPrice} min={0} step={1} onChange={setFormBumpPrice} placeholder="Ex: 1297" />
              </SubBox>

              <Field label="Nome de exibição (opcional)" value={formDisplayName} onChange={setFormDisplayName} placeholder="Sobrescreve o nome do membro nas listas" />
              <Field label="Notas internas (opcional)" value={formNotes} onChange={setFormNotes} placeholder="Contrato, observações…" multiline />

              <SubBox title="VSL + rastreio (opcional)" desc={`VSL embed sobrescreve a VSL principal só na landing /c/{code} dele. Pixels vão pro <head> da mesma landing.`}>
                <Field label="VSL embed HTML (iframe/script)" value={formVslEmbed} onChange={setFormVslEmbed} placeholder='<iframe src="https://player...." …></iframe>' multiline />
                <Field label="Pixels / scripts de rastreio (head)" value={formHeadScripts} onChange={setFormHeadScripts} placeholder='<script>fbq("init", "...")</script>' hint="Cole o snippet completo do Meta Pixel, GA, TikTok etc. Limite 8 KB." multiline />
              </SubBox>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={create} disabled={creating}>{creating ? "Criando…" : "Criar coprodutor"}</button>
              <button className={a.btnSecondary} onClick={() => setShowCreate(false)} disabled={creating}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className={a.modalOverlay} onClick={() => !saving && setEditing(null)}>
          <div className={a.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={a.modalTitle}>Editar coprodutor</h2>
            <p style={{ color: "var(--text-tertiary)", fontSize: 13, margin: "-6px 0 14px" }}>{editing.user.email} · /c/{editing.code}</p>
            <div className={a.formGrid} style={{ gridTemplateColumns: "1fr" }}>
              <Field label="PID Lojou" value={editing.productPid} onChange={(v) => setEditing({ ...editing, productPid: v })} />
              <Field label="Plan ID Lojou" value={editing.planId || ""} onChange={(v) => setEditing({ ...editing, planId: v || null })} />
              <Field label="URL pública do checkout" value={editing.publicCheckoutUrl || ""} onChange={(v) => setEditing({ ...editing, publicCheckoutUrl: v || null })} />
              <NumberField label="Split (%)" value={editing.sharePct} min={0} max={100} onChange={(v) => setEditing({ ...editing, sharePct: v === "" ? 0 : v })} />

              <SubBox title="Order bump">
                <Field label="PID do bump na Lojou" value={editing.bumpProductPid || ""} onChange={(v) => setEditing({ ...editing, bumpProductPid: v || null })} placeholder="Vazio = sem bump próprio" />
                <NumberField label="Preço do bump (MZN)" value={editing.bumpPrice ?? ""} min={0} step={1} onChange={(v) => setEditing({ ...editing, bumpPrice: v === "" ? null : v })} placeholder="Ex: 1297" />
              </SubBox>

              <Field label="Nome de exibição" value={editing.displayName || ""} onChange={(v) => setEditing({ ...editing, displayName: v || null })} />
              <Field label="Notas internas" value={editing.notes || ""} onChange={(v) => setEditing({ ...editing, notes: v || null })} multiline />

              <SubBox title="VSL + rastreio" desc="Em branco = mantém o conteúdo atual. Preencha só para substituir a VSL ou os pixels.">
                <Field label="VSL embed HTML (iframe/script)" value={editVsl} onChange={setEditVsl} placeholder="Em branco mantém a VSL atual" multiline />
                <Field label="Pixels / scripts de rastreio (head)" value={editHead} onChange={setEditHead} placeholder="Em branco mantém os pixels atuais" hint="O coprodutor também pode editar isto na própria conta. Limite 8 KB." multiline />
              </SubBox>

              <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} />
                Conta ativa
              </label>
            </div>
            <div className={a.btnRow}>
              <button className={a.btnPrimary} onClick={saveEdit} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
              <button className={a.btnSecondary} onClick={() => setEditing(null)} disabled={saving}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={a.toast}>{toast}</div>}
    </>
  );
}

function SubBox({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div style={{ padding: 12, border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", background: "var(--bg-glass)", display: "grid", gap: 12 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-tertiary)" }}>{title}</div>
      {desc && <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0 }}>{desc}</p>}
      {children}
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
    <div className={a.formGroup}>
      <label className={a.formLabel}>{label}</label>
      {multiline ? (
        <textarea className={a.formInput} style={{ minHeight: 70, resize: "vertical" }} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input className={a.formInput} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
      {hint && <span style={{ fontSize: 11, color: "var(--text-tertiary)", display: "block" }}>{hint}</span>}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}: {
  label: string;
  value: number | "";
  onChange: (v: number | "") => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className={a.formGroup}>
      <label className={a.formLabel}>{label}</label>
      <input
        className={a.formInput}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === "" ? "" : (parseFloat(e.target.value) || 0))}
      />
    </div>
  );
}
