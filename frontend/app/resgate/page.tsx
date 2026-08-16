"use client";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type RecoverResult = { ok: boolean; message: string; emailHint?: string | null; phoneHint?: string | null };

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
    <main className="rg-page">
      <style>{CSS}</style>
      <div className="rg-glow" aria-hidden />

      <section className="rg-content" role="region" aria-label="Recuperar acesso">
        {!done ? (
          <>
            <div className="rg-emblem" aria-hidden>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="15" r="4" />
                <path d="M10.85 12.15 19 4" />
                <path d="M18 5l2 2" />
                <path d="M15 8l2 2" />
              </svg>
            </div>

            <span className="rg-eyebrow">Recuperar acesso</span>
            <h1 className="rg-title">Perdeu o acesso à sua conta?</h1>
            <p className="rg-sub">
              Assinatura ou curso — informe o contato que usou na compra e reenviamos os seus dados de acesso.
            </p>

            <form onSubmit={submit} className="rg-form">
              <label className="rg-label" htmlFor="rg-id">Telefone ou e-mail da compra</label>
              <input
                id="rg-id"
                className="rg-input"
                placeholder="84xxxxxxx  ·  seu@email.com"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoFocus
                autoComplete="username"
              />
              {error && <div className="rg-error" role="alert">{error}</div>}
              <button type="submit" className="rg-btn" disabled={loading}>
                {loading ? "Enviando…" : "Reenviar meu acesso"}
              </button>
            </form>

            <ol className="rg-steps">
              <li><b>1</b><span>Você informa o contato da compra</span></li>
              <li><b>2</b><span>Enviamos o acesso para o e-mail e o WhatsApp cadastrados</span></li>
              <li><b>3</b><span>É só entrar — e trocar a senha no seu perfil</span></li>
            </ol>

            <p className="rg-foot">
              🔒 Por segurança, o acesso não aparece nesta tela — vai apenas para os seus contatos cadastrados.
            </p>
          </>
        ) : (
          <>
            <div className="rg-emblem rg-emblem-ok" aria-hidden>
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>
            <span className="rg-eyebrow">Enviado</span>
            <h1 className="rg-title">Acesso a caminho ✨</h1>
            <p className="rg-sub">{done.message}</p>

            <div className="rg-channels">
              {done.emailHint && (
                <div className="rg-channel">
                  <span className="rg-channel-ic">📧</span>
                  <span className="rg-channel-tx">
                    Verifique o e-mail <b>{done.emailHint}</b> — inclusive a caixa de spam
                  </span>
                </div>
              )}
              {done.phoneHint && (
                <div className="rg-channel">
                  <span className="rg-channel-ic">💬</span>
                  <span className="rg-channel-tx">
                    E o WhatsApp <b>{done.phoneHint}</b> — chega nos próximos minutos
                  </span>
                </div>
              )}
              {!done.emailHint && !done.phoneHint && (
                <div className="rg-channel">
                  <span className="rg-channel-ic">📧</span>
                  <span className="rg-channel-tx">
                    Verifique o seu <b>e-mail</b> (inclusive o spam) e o seu <b>WhatsApp</b>.
                  </span>
                </div>
              )}
            </div>

            <a href="/login" className="rg-btn rg-btn-link">Ir para o login →</a>
            <p className="rg-foot">Não chegou em alguns minutos? Fale com o suporte que a gente resolve.</p>
          </>
        )}

        <div className="rg-brand">
          <Logo size={20} variant="mark" />
          <span>Plataforma Código Zero</span>
        </div>
      </section>
    </main>
  );
}

const CSS = `
.rg-page {
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  background:
    radial-gradient(1100px 520px at 50% -8%, #06231F 0%, rgba(6,35,31,0) 60%),
    #00110F;
  color: #EAF2F0;
  font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}
.rg-glow {
  position: absolute;
  top: -160px; left: 50%; transform: translateX(-50%);
  width: 520px; height: 520px; border-radius: 50%;
  background: radial-gradient(circle, rgba(45,212,191,0.16) 0%, rgba(45,212,191,0) 68%);
  pointer-events: none;
}
/* Sem card: o conteúdo vive direto na tela, só com largura de leitura. */
.rg-content {
  position: relative;
  width: 100%;
  max-width: 400px;
  animation: rg-in 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
@keyframes rg-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }

.rg-emblem {
  width: 52px; height: 52px; border-radius: 15px;
  display: flex; align-items: center; justify-content: center;
  color: #2DD4BF;
  background: rgba(45,212,191,0.10);
  border: 1px solid rgba(45,212,191,0.28);
  margin-bottom: 20px;
}
.rg-emblem-ok { color: #34D399; background: rgba(52,211,153,0.10); border-color: rgba(52,211,153,0.30); }

.rg-eyebrow {
  display: block;
  font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
  color: #2DD4BF; margin-bottom: 10px;
}
.rg-title {
  font-size: 26px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.15;
  margin: 0 0 10px; color: #fff; text-wrap: balance;
}
.rg-sub { font-size: 15px; line-height: 1.6; color: #93A69F; margin: 0 0 24px; }

.rg-form { display: flex; flex-direction: column; }
.rg-label { font-size: 12.5px; font-weight: 600; color: #B7C6C1; margin-bottom: 8px; }
.rg-input {
  width: 100%; box-sizing: border-box;
  background: rgba(0,0,0,0.28);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 12px;
  padding: 14px 15px; color: #fff; font-size: 15px; outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.rg-input::placeholder { color: #566862; }
.rg-input:focus { border-color: rgba(45,212,191,0.6); box-shadow: 0 0 0 3px rgba(45,212,191,0.14); }

.rg-btn {
  width: 100%; margin-top: 16px;
  background: #2DD4BF; color: #00201C;
  border: none; border-radius: 12px;
  padding: 15px 16px; font-size: 15px; font-weight: 700; cursor: pointer;
  transition: transform 0.08s, background 0.15s, opacity 0.15s;
}
.rg-btn:hover:not(:disabled) { background: #34E0CC; }
.rg-btn:active:not(:disabled) { transform: translateY(1px); }
.rg-btn:disabled { opacity: 0.6; cursor: default; }
.rg-btn-link { display: block; text-align: center; text-decoration: none; }

.rg-error {
  margin-top: 12px;
  background: rgba(239,68,68,0.10); border: 1px solid rgba(239,68,68,0.35);
  color: #fca5a5; border-radius: 11px; padding: 11px 13px; font-size: 13.5px; line-height: 1.5;
}

.rg-steps { list-style: none; margin: 24px 0 0; padding: 20px 0 0; border-top: 1px solid rgba(255,255,255,0.07); display: grid; gap: 14px; }
.rg-steps li { display: flex; align-items: center; gap: 12px; font-size: 13.5px; color: #A9BAB4; line-height: 1.4; }
.rg-steps b {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  background: rgba(45,212,191,0.10); border: 1px solid rgba(45,212,191,0.22);
  color: #2DD4BF; font-size: 12.5px; font-weight: 700;
}

.rg-channels { display: grid; gap: 12px; margin: 4px 0 22px; }
.rg-channel { display: flex; align-items: flex-start; gap: 11px; font-size: 14.5px; color: #C9D6D2; line-height: 1.5; }
.rg-channel-ic { font-size: 18px; line-height: 1.4; flex-shrink: 0; }
.rg-channel-tx b { color: #fff; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: 0.01em; }

.rg-foot { margin: 18px 0 0; font-size: 12.5px; color: #5B706B; line-height: 1.55; }

.rg-brand {
  display: flex; align-items: center; gap: 8px;
  margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11.5px; letter-spacing: 0.02em; color: #4A5D58; font-weight: 500;
}
`;
