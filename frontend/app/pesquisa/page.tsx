"use client";
/**
 * /pesquisa — pesquisa de satisfação pós-compra (canal web/email).
 *
 * Com ?token= (link assinado enviado por e-mail): carrega as 4 perguntas +
 * campo de sugestão em uma página só. Respostas parciais que já chegaram via
 * WhatsApp vêm pré-marcadas e travadas. Sem token: pede o e-mail de cliente e
 * envia um link novo (resposta sempre genérica — anti-enumeração).
 */
import { Suspense, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type SurveyState = {
  firstName: string;
  questions: { key: string; text: string }[];
  options: string[];
  answered: Record<string, number>;
  completed: boolean;
};

export default function PesquisaPage() {
  return (
    <main style={S.page}>
      <Suspense fallback={<div style={S.card}>Carregando…</div>}>
        <PesquisaInner />
      </Suspense>
    </main>
  );
}

function PesquisaInner() {
  const token = useSearchParams().get("token") || "";
  return (
    <div style={S.card}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <Logo size={38} />
      </div>
      {token ? <SurveyForm token={token} /> : <RequestLinkForm />}
    </div>
  );
}

function SurveyForm({ token }: { token: string }) {
  const [state, setState] = useState<SurveyState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [suggestion, setSuggestion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/api/feedback/survey?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) {
          setLoadError(j.error || "Link inválido ou expirado.");
          return;
        }
        setState(j as SurveyState);
        setAnswers((j as SurveyState).answered || {});
      })
      .catch(() => alive && setLoadError("Erro de conexão. Tente novamente em instantes."));
    return () => {
      alive = false;
    };
  }, [token]);

  if (loadError) {
    return (
      <>
        <h1 style={S.title}>Ops…</h1>
        <p style={S.subtitle}>{loadError}</p>
        <RequestLinkForm compact />
      </>
    );
  }
  if (!state) return <p style={S.subtitle}>Carregando a pesquisa…</p>;
  if (state.completed || done) {
    return (
      <>
        <h1 style={S.title}>{done ? "Obrigado! 💚" : "Pesquisa já respondida ✓"}</h1>
        <p style={S.subtitle}>
          {done
            ? "Sua resposta foi enviada direto pra equipe do Código Zero. Ela vale muito pra gente."
            : "Você já respondeu esta pesquisa. Obrigado pela contribuição!"}
        </p>
      </>
    );
  }

  const allAnswered = state.questions.every((q) => answers[q.key] != null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const r = await fetch(`${API_URL}/api/feedback/survey/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, answers, suggestion: suggestion.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409) setDone(true);
        else setSubmitError(j.error || "Não foi possível enviar. Tente de novo.");
        return;
      }
      setDone(true);
    } catch {
      setSubmitError("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <h1 style={S.title}>{state.firstName ? `${state.firstName}, sua` : "Sua"} opinião vale muito</h1>
      <p style={S.subtitle}>
        4 perguntas rápidas sobre sua experiência no <strong style={{ color: "#fff" }}>Código Zero</strong> +
        espaço pra sugestões. Leva menos de 2 minutos.
      </p>

      <form onSubmit={submit}>
        {state.questions.map((q, qi) => {
          const locked = state.answered[q.key] != null;
          return (
            <fieldset key={q.key} style={S.questionBlock}>
              <legend style={S.questionText}>
                <span style={S.questionNumber}>{qi + 1}.</span> {q.text}
                {locked && <span style={S.lockedTag}> respondida no WhatsApp ✓</span>}
              </legend>
              <div style={S.optionsGrid}>
                {state.options.map((opt, oi) => {
                  const score = oi + 1;
                  const selected = answers[q.key] === score;
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={locked}
                      onClick={() => setAnswers((a) => ({ ...a, [q.key]: score }))}
                      style={{
                        ...S.optionCard,
                        ...(selected ? S.optionCardSelected : {}),
                        ...(locked && !selected ? { opacity: 0.35, cursor: "default" } : {}),
                        ...(locked && selected ? { cursor: "default" } : {}),
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div style={S.questionBlock}>
          <label style={S.questionText} htmlFor="sugestao">
            💡 O que poderíamos melhorar ou adicionar? <span style={S.optionalTag}>(opcional)</span>
          </label>
          <textarea
            id="sugestao"
            style={S.textarea}
            rows={4}
            maxLength={4000}
            placeholder="Escreva aqui sua sugestão com toda sinceridade…"
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
          />
        </div>

        {submitError && <div style={S.error}>{submitError}</div>}
        <button
          type="submit"
          style={{ ...S.btn, opacity: !allAnswered || submitting ? 0.5 : 1 }}
          disabled={!allAnswered || submitting}
        >
          {submitting ? "Enviando…" : allAnswered ? "Enviar respostas" : "Responda as 4 perguntas"}
        </button>
      </form>

      <p style={S.foot}>Suas respostas vão direto pra equipe do Código Zero.</p>
    </>
  );
}

function RequestLinkForm({ compact }: { compact?: boolean }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || loading) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/feedback/request-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      setMessage(
        j.message || "Se houver uma conta de cliente com esse e-mail, enviamos o link da pesquisa.",
      );
    } catch {
      setMessage("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!compact && (
        <>
          <h1 style={S.title}>Pesquisa de satisfação</h1>
          <p style={S.subtitle}>
            Esta pesquisa é exclusiva pra quem é (ou já foi) cliente do{" "}
            <strong style={{ color: "#fff" }}>Código Zero</strong>. Informe o e-mail da sua conta e enviaremos
            o link de acesso.
          </p>
        </>
      )}
      {compact && (
        <p style={{ ...S.subtitle, marginTop: 14 }}>
          É (ou já foi) cliente? Informe o e-mail da sua conta e enviaremos um link novo:
        </p>
      )}

      {message ? (
        <div style={S.infoBox}>{message}</div>
      ) : (
        <form onSubmit={submit} style={{ marginTop: 6 }}>
          <label style={S.label}>E-mail da sua conta</label>
          <input
            style={S.input}
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? "Enviando…" : "Receber link da pesquisa"}
          </button>
        </form>
      )}
    </>
  );
}

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: "#001412",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "28px 16px 48px",
  },
  card: {
    width: "100%",
    maxWidth: 520,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: "30px 24px",
    backdropFilter: "blur(12px)",
  },
  title: { fontSize: 23, fontWeight: 800, color: "#fff", textAlign: "center", margin: "0 0 8px", letterSpacing: "-0.02em" },
  subtitle: { fontSize: 14.5, color: "#A1A1AA", textAlign: "center", lineHeight: 1.55, margin: "0 0 18px" },
  questionBlock: { border: "none", margin: "0 0 20px", padding: 0 },
  questionText: { display: "block", fontSize: 14.5, fontWeight: 600, color: "#fff", lineHeight: 1.5, marginBottom: 10, padding: 0 },
  questionNumber: { color: "#2DD4BF" },
  lockedTag: { fontSize: 12, fontWeight: 500, color: "#2DD4BF" },
  optionalTag: { fontSize: 12.5, fontWeight: 400, color: "#52525B" },
  optionsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  optionCard: {
    minHeight: 46,
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "12px 10px",
    color: "#d4d4d8",
    fontSize: 13.5,
    fontWeight: 600,
    cursor: "pointer",
    textAlign: "center" as const,
    lineHeight: 1.3,
  },
  optionCardSelected: {
    background: "rgba(45,212,191,0.14)",
    border: "1px solid #2DD4BF",
    color: "#2DD4BF",
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "12px 14px",
    color: "#fff",
    fontSize: 14.5,
    outline: "none",
    resize: "vertical" as const,
    fontFamily: "inherit",
    lineHeight: 1.55,
  },
  label: { display: "block", fontSize: 13, color: "#A1A1AA", marginBottom: 8, fontWeight: 500 },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: "13px 14px",
    color: "#fff",
    fontSize: 15,
    outline: "none",
  },
  btn: {
    width: "100%",
    marginTop: 14,
    background: "#2DD4BF",
    color: "#001412",
    border: "none",
    borderRadius: 10,
    padding: "14px 16px",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
  },
  error: {
    marginTop: 4,
    marginBottom: 6,
    background: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#fca5a5",
    borderRadius: 10,
    padding: "11px 13px",
    fontSize: 13.5,
    lineHeight: 1.5,
  },
  infoBox: {
    background: "rgba(45,212,191,0.10)",
    border: "1px solid rgba(45,212,191,0.35)",
    color: "#5eead4",
    borderRadius: 12,
    padding: "13px 15px",
    fontSize: 13.5,
    lineHeight: 1.6,
  },
  foot: { marginTop: 16, fontSize: 12.5, color: "#52525B", textAlign: "center", lineHeight: 1.5 },
};
