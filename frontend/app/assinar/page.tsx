"use client";
// Ponte de checkout da landing só-VSL: o botão DENTRO do player (Kilax)
// aponta para cá. Mini-gate (nome/email/WhatsApp) → registra o lead no
// backend — anexando o código de afiliado guardado pelo /r/{code} quando
// existir (janela de 45 dias) → redireciona pro checkout certo (Lojou, ou
// Stripe para telefone internacional). É o elo que preserva a COMISSÃO do
// afiliado: o webhook credita via referredByCode gravado aqui, casando o
// e-mail/telefone do lead com o pagamento.
import { useEffect, useState, type FormEvent, type CSSProperties } from "react";
import { Logo } from "@/components/Logo";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const AFF_WINDOW_MS = 45 * 24 * 60 * 60 * 1000; // 45 dias de atribuição

const DDI = ["+258", "+55", "+244", "+27", "+351", "+1", "+44"];

function storedCode(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { code, ts } = JSON.parse(raw);
    if (!code || !ts || Date.now() - ts > AFF_WINDOW_MS) return undefined;
    return String(code);
  } catch {
    return undefined;
  }
}

export default function AssinarPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [ddi, setDdi] = useState("+258");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [affCode, setAffCode] = useState<string | undefined>(undefined);
  const [coproCode, setCoproCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    setAffCode(storedCode("cz_aff"));
    setCoproCode(storedCode("cz_copro"));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !whatsapp.trim()) {
      setError("Preencha nome, e-mail e WhatsApp.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/landing/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          whatsapp: `${ddi}${whatsapp.replace(/\D/g, "")}`,
          phoneCode: ddi,
          ...(affCode ? { affiliateCode: affCode } : {}),
          // Coprodutor: mesmo mecanismo (o backend dá preferência ao afiliado
          // quando os dois chegam juntos — regra já existente no /lead).
          ...(coproCode ? { coproducerCode: coproCode } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok || !d.checkoutUrl) throw new Error(d.error || "Não foi possível abrir o checkout.");
      // Mesma aba (in-app browsers do IG/WhatsApp ignoram _blank).
      window.location.href = d.checkoutUrl;
    } catch (err: any) {
      setError(err?.message || "Não foi possível abrir o checkout. Tente de novo.");
      setLoading(false);
    }
  };

  return (
    <main style={S.page}>
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Logo size={36} />
        </div>
        <h1 style={S.title}>Garanta seu acesso</h1>
        <p style={S.subtitle}>
          Preenche teus dados pra ir ao pagamento — teu acesso chega no <strong style={{ color: "#fff" }}>WhatsApp e e-mail</strong> na hora.
        </p>
        <form onSubmit={submit}>
          <label style={S.label}>Nome</label>
          <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Teu nome" autoComplete="name" />
          <label style={S.label}>E-mail</label>
          <input style={S.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teu@email.com" autoComplete="email" />
          <label style={S.label}>WhatsApp</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...S.input, width: 92, flexShrink: 0 }} value={ddi} onChange={(e) => setDdi(e.target.value)}>
              {DDI.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <input style={S.input} inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="84 123 4567" autoComplete="tel" />
          </div>
          {error && <div style={S.error}>{error}</div>}
          <button type="submit" style={{ ...S.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? "Abrindo o pagamento…" : "Continuar para o pagamento →"}
          </button>
        </form>
        <p style={S.foot}>🔒 Pagamento seguro · M-Pesa, e-Mola e cartão</p>
      </div>
    </main>
  );
}

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100dvh", background: "#001412", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: "30px 26px", backdropFilter: "blur(12px)" },
  title: { fontSize: 24, fontWeight: 800, color: "#fff", textAlign: "center", margin: "0 0 8px", letterSpacing: "-0.02em" },
  subtitle: { fontSize: 14.5, color: "#A1A1AA", textAlign: "center", lineHeight: 1.55, margin: "0 0 20px" },
  label: { display: "block", fontSize: 13, color: "#A1A1AA", margin: "12px 0 6px", fontWeight: 500 },
  input: { width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "13px 14px", color: "#fff", fontSize: 15, outline: "none" },
  btn: { width: "100%", marginTop: 18, background: "#2DD4BF", color: "#001412", border: "none", borderRadius: 10, padding: "15px 16px", fontSize: 15.5, fontWeight: 800, cursor: "pointer" },
  error: { marginTop: 12, background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", color: "#fca5a5", borderRadius: 10, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.5 },
  foot: { marginTop: 14, fontSize: 12.5, color: "#52525B", textAlign: "center" },
};
