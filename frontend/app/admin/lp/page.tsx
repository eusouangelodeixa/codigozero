"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../admin.module.css";
import k from "@/components/admin/kit.module.css";
import { AdminPage } from "@/components/admin";
import { LP_DEFAULTS, type LpSurveyStep } from "../../lp/lpDefaults";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("cz_token")}`, "Content-Type": "application/json" });

// Editor for the reels LP (lp.czero.sbs). Copy + the two CTA links live inside
// LandingConfig.sections.lp (JSON) — we load the whole landing config, edit
// only the `lp` key, and PATCH it back preserving every other section. The
// public page reads the same blob via GET /api/lp/config.
export default function AdminLp() {
  const router = useRouter();
  const [cfg, setCfg] = useState<any>({});               // full LandingConfig (preserved on save)
  const [lp, setLp] = useState<any>({ ...LP_DEFAULTS }); // the sections.lp blob we edit
  const [count, setCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState("");

  useEffect(() => {
    fetch(`${API}/api/admin/landing-config`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => {
        const config = d.config || {};
        setCfg(config);
        setLp({ ...LP_DEFAULTS, ...((config.sections || {}).lp || {}) });
      })
      .catch(() => {});

    fetch(`${API}/api/admin/leads?source=lp:reels`, { headers: hdr() })
      .then((r) => r.json())
      .then((d) => setCount(typeof d.total === "number" ? d.total : (d.leads?.length ?? 0)))
      .catch(() => setCount(null));
  }, []);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const u = (key: string, val: any) => setLp((p: any) => ({ ...p, [key]: val }));

  // Busca os grupos da instância admin no Komunika (com sync — reflete os
  // grupos atuais do WhatsApp). O escolhido vai em lp.announceGroup no Salvar.
  const loadGroups = async () => {
    setLoadingGroups(true);
    setGroupsError("");
    try {
      const r = await fetch(`${API}/api/admin/central/groups?sync=1`, { headers: hdr() });
      const d = await r.json();
      setGroups(Array.isArray(d.groups) ? d.groups : []);
      if (d.error) setGroupsError(d.error);
      else if (!d.groups?.length) setGroupsError("Nenhum grupo encontrado na instância admin do Komunika.");
    } catch {
      setGroupsError("Erro de conexão ao carregar os grupos.");
    } finally {
      setLoadingGroups(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const nextSections = { ...(cfg.sections || {}), lp };
      const r = await fetch(`${API}/api/admin/landing-config`, {
        method: "PATCH", headers: hdr(),
        body: JSON.stringify({ ...cfg, sections: nextSections }),
      });
      if (!r.ok) throw new Error();
      const d = await r.json().catch(() => ({}));
      if (d.config) setCfg(d.config);
      showToast("LP dos Reels salva ✓");
    } catch {
      showToast("Erro ao salvar. Tente de novo.");
    } finally { setSaving(false); }
  };

  const Field = ({ label, field, multiline, hint }: { label: string; field: string; multiline?: boolean; hint?: string }) => (
    <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
      <label className={styles.formLabel}>{label}</label>
      {multiline ? (
        <textarea className={styles.formTextarea} value={lp[field] || ""} onChange={(e) => u(field, e.target.value)} />
      ) : (
        <input className={styles.formInput} value={lp[field] || ""} onChange={(e) => u(field, e.target.value)} />
      )}
      {hint && <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "6px 2px 0" }}>{hint}</p>}
    </div>
  );

  const steps: LpSurveyStep[] = Array.isArray(lp.surveySteps) ? lp.surveySteps : LP_DEFAULTS.surveySteps;
  const setStep = (i: number, patch: Partial<LpSurveyStep>) => {
    const arr = steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    u("surveySteps", arr);
  };

  return (
    <>
      <AdminPage
        title="LP — Reels"
        actions={
          <>
            <a className={`${k.btn} ${k.btnSecondary}`} href="/lp" target="_blank" rel="noopener noreferrer">Ver página ↗</a>
            <button type="button" className={`${k.btn} ${k.btnPrimary}`} onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </button>
          </>
        }
      >

      {/* ── Inscrições (tracking) ── */}
      <div className={styles.card} style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: 0.6 }}>Inscrições nesta LP</div>
          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>
            {count === null ? "—" : count}
          </div>
        </div>
        <button className={styles.btnSecondary} onClick={() => router.push("/admin/leads")}>
          Ver leads →
        </button>
      </div>

      {/* ── Link do grupo (o mais importante) ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>🔗 Link do grupo</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
          Onde cai o botão verde da tela final (“TÁ LIBERADO”). O link da Central vai na <strong>descrição do grupo</strong> — o lead só descobre depois de entrar.
        </p>
        <div className={styles.formGrid}>
          <Field label="Link do grupo do WhatsApp (botão verde)" field="groupUrl" hint="Cole o convite do grupo (https://chat.whatsapp.com/…). Enquanto vazio, o botão fica desativado." />
        </div>
      </div>

      {/* ── Aviso automático de conteúdo novo no grupo ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>📢 Aviso de conteúdo novo no grupo</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
          Ao <strong>publicar</strong> um conteúdo na Central, ~10 minutos depois um resumo breve com o link
          cai automaticamente no grupo selecionado (enviado pela instância admin do Komunika). Cada conteúdo
          é anunciado uma única vez.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className={styles.formInput}
            style={{ maxWidth: 420 }}
            value={lp.announceGroup?.id || ""}
            onChange={(e) => {
              const id = e.target.value;
              const g = groups.find((x) => x.id === id);
              u("announceGroup", id ? { id, name: g?.name || lp.announceGroup?.name || "" } : null);
            }}
          >
            <option value="">— Nenhum grupo (aviso desativado) —</option>
            {lp.announceGroup?.id && !groups.some((g) => g.id === lp.announceGroup.id) && (
              <option value={lp.announceGroup.id}>{lp.announceGroup.name || lp.announceGroup.id}</option>
            )}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <button className={styles.btnSecondary} onClick={loadGroups} disabled={loadingGroups}>
            {loadingGroups ? "Carregando…" : "Carregar grupos do Komunika"}
          </button>
        </div>
        {groupsError && (
          <p style={{ fontSize: 13, color: "var(--color-error, #f87171)", marginTop: 10 }}>{groupsError}</p>
        )}
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "10px 2px 0" }}>
          Clica em "Carregar grupos" pra listar os grupos do número admin, escolhe o grupo e <strong>Salvar</strong>.
        </p>
      </div>

      {/* ── Hero ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🏷️ Topo (Hero)</h2>
        <div className={styles.formGrid}>
          <Field label="Sobrelinha (eyebrow)" field="eyebrow" />
          <Field label="Título — parte 1" field="heroTitlePre" />
          <Field label="Título — palavra em destaque (laranja)" field="heroTitleHighlight" />
          <Field label="Título — parte 2" field="heroTitlePost" />
          <Field label="Descrição (use **negrito**)" field="heroDesc" multiline />
        </div>
      </div>

      {/* ── Formulário (passo 0) ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📝 Formulário (nome + WhatsApp)</h2>
        <div className={styles.formGrid}>
          <Field label="Título do card" field="formTitle" />
          <Field label="Subtítulo" field="formSubtitle" />
          <Field label="Rótulo do nome" field="nameLabel" />
          <Field label="Placeholder do nome" field="namePlaceholder" />
          <Field label="Rótulo do WhatsApp" field="whatsappLabel" />
          <Field label="Placeholder do WhatsApp" field="whatsappPlaceholder" />
          <Field label="Dica do WhatsApp" field="whatsappHint" multiline />
          <Field label="Texto do botão" field="submitCta" />
          <Field label="Rodapé do formulário" field="formFootnote" />
        </div>
      </div>

      {/* ── Perguntas (survey) ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>❓ Perguntas de qualificação</h2>
        <p style={{ fontSize: 13, color: "var(--text-tertiary)", marginBottom: 16 }}>
          3 toques. As respostas ficam salvas em cada lead (surveyAnswers).
        </p>
        <div className={`${styles.formGroup} ${styles.formGroupFull}`} style={{ marginBottom: 16 }}>
          <label className={styles.formLabel}>Título das perguntas</label>
          <input className={styles.formInput} value={lp.surveyTitle || ""} onChange={(e) => u("surveyTitle", e.target.value)} />
        </div>
        {steps.map((s, i) => (
          <div key={i} className={styles.formGrid} style={{ padding: 16, background: "rgba(0,0,0,0.2)", borderRadius: 8, marginBottom: 12 }}>
            <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
              <label className={styles.formLabel}>Pergunta {i + 1}</label>
              <input className={styles.formInput} value={s.question || ""} onChange={(e) => setStep(i, { question: e.target.value })} />
            </div>
            {(s.options || []).map((opt, oi) => (
              <div key={oi} className={styles.formGroup}>
                <label className={styles.formLabel}>Opção {oi + 1}</label>
                <input className={styles.formInput} value={opt} onChange={(e) => {
                  const options = [...(s.options || [])]; options[oi] = e.target.value;
                  setStep(i, { options });
                }} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ── Tela final ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>✅ Tela final (TÁ LIBERADO)</h2>
        <div className={styles.formGrid}>
          <Field label="Título — parte 1" field="successTitlePre" />
          <Field label="Título — destaque (laranja)" field="successTitleHighlight" />
          <Field label="Descrição" field="successDesc" multiline />
          <Field label="Passo 1 — título" field="step1Title" />
          <Field label="Passo 1 — descrição" field="step1Desc" multiline />
          <Field label="Passo 1 — texto do botão" field="step1Cta" />
          <Field label="Passo 2 — título" field="step2Title" />
          <Field label="Passo 2 — descrição (só texto, sem botão — use **negrito**)" field="step2Desc" multiline />
        </div>
      </div>

      {/* ── Rodapé ── */}
      <div className={styles.card} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>📄 Rodapé</h2>
        <div className={styles.formGrid}>
          <Field label="Texto do rodapé" field="footer" />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className={styles.btnPrimary} onClick={save} disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
      </AdminPage>

      {toast && <div className={styles.toast}>{toast}</div>}
    </>
  );
}
