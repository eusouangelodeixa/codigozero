"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./lp.module.css";
import { LP_DEFAULTS, type LpConfig, type LpSurveyStep } from "./lpDefaults";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const LEAD_KEY = "cz_lp_lead";

/** Render **bold** markers in admin-authored copy as real <strong> spans. */
function renderBold(text: string): React.ReactNode {
  if (!text) return null;
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

type Stage = "form" | "survey" | "done";

export default function LpClient() {
  const [cfg, setCfg] = useState<LpConfig>(LP_DEFAULTS);
  const [stage, setStage] = useState<Stage>("form");
  const [qi, setQi] = useState(0); // survey question index (0..steps-1)

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const steps: LpSurveyStep[] = useMemo(
    () => (Array.isArray(cfg.surveySteps) && cfg.surveySteps.length ? cfg.surveySteps : LP_DEFAULTS.surveySteps),
    [cfg.surveySteps]
  );

  // Load admin overrides + prefill a returning visitor, and paint the warm
  // background over the app's global teal body while this page is mounted.
  useEffect(() => {
    fetch(`${API}/api/lp/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.config) setCfg({ ...LP_DEFAULTS, ...d.config }); })
      .catch(() => {});

    try {
      const saved = JSON.parse(localStorage.getItem(LEAD_KEY) || "null");
      if (saved?.name) setName(saved.name);
      if (saved?.whatsapp) setWhatsapp(saved.whatsapp);
    } catch {}

    const prev = document.body.style.background;
    document.body.style.background = "#1a1512";
    return () => { document.body.style.background = prev; };
  }, []);

  const saveLead = (data: Record<string, unknown>) => {
    try {
      const prev = JSON.parse(localStorage.getItem(LEAD_KEY) || "null") || {};
      localStorage.setItem(LEAD_KEY, JSON.stringify({ ...prev, ...data, savedAt: prev.savedAt || new Date().toISOString() }));
    } catch {}
  };

  const postLead = async (payload: Record<string, unknown>) => {
    const r = await fetch(`${API}/api/lp/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || "Erro. Tente de novo.");
    }
  };

  // Step 0 — capture name + WhatsApp, then advance to the survey.
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !whatsapp.trim()) { setErr("Preencha o nome e o WhatsApp."); return; }
    if (whatsapp.replace(/\D/g, "").length < 8) { setErr("Confere o número do WhatsApp."); return; }
    setSubmitting(true); setErr("");
    try {
      await postLead({ name: name.trim(), whatsapp: whatsapp.trim() });
      saveLead({ name: name.trim(), whatsapp: whatsapp.trim() });
      setStage("survey"); setQi(0);
    } catch (e: any) {
      setErr(e?.message || "Erro de conexão. Tente de novo.");
    } finally { setSubmitting(false); }
  };

  // Each survey tap records the answer and advances; the last one finalizes.
  const chooseOption = async (value: string) => {
    const key = steps[qi]?.key || `q${qi}`;
    const next = { ...answers, [key]: value };
    setAnswers(next);
    if (qi < steps.length - 1) { setQi(qi + 1); return; }
    // Final answer → upsert the survey onto the lead, then reveal the group.
    setStage("done");
    postLead({ name: name.trim(), whatsapp: whatsapp.trim(), survey: next }).catch(() => {});
    saveLead({ survey: next });
  };

  const groupUrl = (cfg.groupUrl || "").trim();
  const centralUrl = (cfg.centralUrl || LP_DEFAULTS.centralUrl).trim();

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        {stage !== "done" && (
          <>
            <div className={styles.eyebrow}>{cfg.eyebrow}</div>
            <h1 className={styles.heroTitle}>
              {cfg.heroTitlePre} <span className={styles.hl}>{cfg.heroTitleHighlight}</span> {cfg.heroTitlePost}
            </h1>
            <div className={styles.rule} />
            <p className={styles.heroDesc}>{renderBold(cfg.heroDesc)}</p>
          </>
        )}

        {/* ── STEP 0 — name + WhatsApp ─────────────────────────────── */}
        {stage === "form" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>{cfg.formTitle}</h2>
                <p className={styles.cardSub}>{cfg.formSubtitle}</p>
              </div>
            </div>
            <form className={styles.form} onSubmit={submitForm}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="lp-name">{cfg.nameLabel}</label>
                <input
                  id="lp-name" className={styles.input} value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={cfg.namePlaceholder} autoComplete="name"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="lp-wa">{cfg.whatsappLabel}</label>
                <input
                  id="lp-wa" className={styles.input} value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder={cfg.whatsappPlaceholder} inputMode="tel" autoComplete="tel"
                />
                <p className={styles.hint}>{cfg.whatsappHint}</p>
              </div>
              <button className={styles.cta} type="submit" disabled={submitting}>
                {submitting ? "Enviando…" : cfg.submitCta}
              </button>
              {err && <p className={styles.error}>{err}</p>}
              <p className={styles.footnote}>{cfg.formFootnote}</p>
            </form>
          </section>
        )}

        {/* ── STEPS 1–3 — qualifying survey ────────────────────────── */}
        {stage === "survey" && (
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>{cfg.surveyTitle}</h2>
                <p className={styles.cardSub}>
                  {steps.length - qi} {steps.length - qi === 1 ? "toque" : "toques"} e o material é seu.
                </p>
              </div>
              <div className={styles.progress} aria-hidden>
                {steps.map((_, i) => (
                  <span key={i} className={`${styles.seg} ${i <= qi ? styles.segOn : ""}`} />
                ))}
              </div>
            </div>

            <p className={styles.question}>{steps[qi]?.question}</p>
            <div className={steps[qi]?.layout === "stack" ? styles.optStack : styles.optGrid}>
              {(steps[qi]?.options || []).map((opt) => (
                <button key={opt} className={styles.opt} onClick={() => chooseOption(opt)} type="button">
                  {opt}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── SUCCESS — TÁ LIBERADO ────────────────────────────────── */}
        {stage === "done" && (
          <div className={styles.success}>
            <div className={styles.eyebrow} style={{ marginBottom: 24 }}>{cfg.eyebrow}</div>
            <div className={styles.checkBadge}>✓</div>
            <h1 className={styles.successTitle}>
              {cfg.successTitlePre} <span className={styles.hl}>{cfg.successTitleHighlight}</span>
            </h1>
            <p className={styles.successDesc}>{cfg.successDesc}</p>

            <div className={styles.stepCard}>
              <div className={styles.stepRow}>
                <div className={styles.stepNum}>1</div>
                <div>
                  <h3 className={styles.stepTitle}>{cfg.step1Title}</h3>
                  <p className={styles.stepDesc}>{cfg.step1Desc}</p>
                </div>
              </div>
              {groupUrl ? (
                <a className={styles.waCta} href={groupUrl} target="_blank" rel="noopener noreferrer">
                  {cfg.step1Cta}
                </a>
              ) : (
                <div className={styles.waCta} style={{ opacity: 0.5, cursor: "default" }}>
                  Link do grupo em breve
                </div>
              )}
            </div>

            <div className={styles.stepCard}>
              <div className={styles.stepRow}>
                <div className={styles.stepNum}>2</div>
                <div>
                  <h3 className={styles.stepTitle}>{cfg.step2Title}</h3>
                  <p className={styles.stepDesc}>{renderBold(cfg.step2Desc)}</p>
                </div>
              </div>
              <a className={styles.centralCta} href={centralUrl} target="_blank" rel="noopener noreferrer">
                {cfg.step2Cta}
              </a>
            </div>
          </div>
        )}

        <div className={styles.footer}>{cfg.footer}</div>
      </div>
    </div>
  );
}
