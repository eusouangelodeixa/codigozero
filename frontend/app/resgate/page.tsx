"use client";
import { useState, type CSSProperties, type FormEvent } from "react";
import { Logo } from "@/components/Logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type RecoverResult = { ok: boolean; message: string };

export default function ResgatePage() {
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<RecoverResult | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API_URL}/api/auth/recover-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Não foi possível recuperar o acesso.");
        return;
      }
      setDone(j as RecoverResult);
    } catch {
      setError("Erro de conexão. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Logo size={38} />
        </div>

        {!done ? (
          <>
            <h1 style={S.title}>Resgatar acesso</h1>
            <p style={S.subtitle}>
              Comprou o <strong style={{ color: "#fff" }}>Código Zero</strong> ou um dos nossos{" "}
              <strong style={{ color: "#fff" }}>cursos</strong> e não recebeu seus dados? Reenviamos o seu
              acesso para o e-mail e o WhatsApp cadastrados na compra.
            </p>

            <form onSubmit={submit} style={{ marginTop: 18 }}>
              <label style={S.label}>Telefone ou e-mail usado na compra</label>
              <input
                style={S.input}
                placeholder="ex: 84xxxxxxx  ou  seu@email.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
              />
              {error && <div style={S.error}>{error}</div>}
              <button type="submit" style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
                {loading ? "Enviando…" : "Reenviar meu acesso"}
              </button>
            </form>

            <p style={S.foot}>
              Por segurança, o acesso vai apenas para os contatos cadastrados — não é exibido aqui. Se não
              chegar em alguns minutos (verifique o spam), fale com o suporte.
            </p>
          </>
        ) : (
          <>
            <h1 style={S.title}>Prontinho! ✅</h1>
            <p style={S.subtitle}>{done.message}</p>
            <div style={S.productBox}>
              📧 Verifique o seu <strong style={{ color: "#fff" }}>e-mail</strong> (inclusive o spam) e o seu{" "}
              <strong style={{ color: "#fff" }}>WhatsApp</strong>. As credenciais chegam nos próximos minutos.
            </div>
            <a href="/login" style={{ ...S.btn, textDecoration: "none", display: "block", textAlign: "center", marginTop: 8 }}>
              Ir para o login →
            </a>
          </>
        )}
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: "100dvh",
    background: "#001412",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: "32px 26px",
    backdropFilter: "blur(12px)",
  },
  title: { fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center", margin: "0 0 8px", letterSpacing: "-0.02em" },
  subtitle: { fontSize: 14.5, color: "#A1A1AA", textAlign: "center", lineHeight: 1.55, margin: "0 0 18px" },
  warnBox: {
    background: "rgba(245,158,11,0.10)",
    border: "1px solid rgba(245,158,11,0.35)",
    color: "#fcd34d",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 13.5,
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
    marginTop: 16,
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
    marginTop: 12,
    background: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.35)",
    color: "#fca5a5",
    borderRadius: 10,
    padding: "11px 13px",
    fontSize: 13.5,
    lineHeight: 1.5,
  },
  foot: { marginTop: 16, fontSize: 12.5, color: "#52525B", textAlign: "center", lineHeight: 1.5 },
  productBox: {
    background: "rgba(45,212,191,0.06)",
    border: "1px solid rgba(45,212,191,0.22)",
    borderRadius: 12,
    padding: "12px 14px",
    margin: "4px 0 14px",
  },
  productRow: { fontSize: 14, fontWeight: 600, color: "#fff", marginTop: 6 },
  credBox: { display: "flex", flexDirection: "column", gap: 10, margin: "4px 0 16px" },
  credRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    padding: "12px 14px",
  },
  credLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#52525B", marginBottom: 3 },
  credValue: { fontSize: 16, color: "#fff", fontWeight: 600, wordBreak: "break-all" },
  copyBtn: {
    flexShrink: 0,
    background: "rgba(45,212,191,0.12)",
    border: "1px solid rgba(45,212,191,0.4)",
    color: "#2DD4BF",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  },
  dangerBox: {
    marginTop: 18,
    background: "rgba(239,68,68,0.10)",
    border: "1px solid rgba(239,68,68,0.4)",
    color: "#fca5a5",
    borderRadius: 12,
    padding: "13px 15px",
    fontSize: 13.5,
    lineHeight: 1.6,
  },
};
