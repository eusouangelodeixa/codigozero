"use client";
import { useState, useEffect, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { Button, Input } from "@/components/ui";
import styles from "./login.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Para onde ir depois do login:
//  • coprodutor → painel de coprodução
//  • comprador SÓ de curso (sem acesso à plataforma) → /forja (ponte SSO que
//    o leva à área de membros, ao curso dele) — senão cairia no dashboard 403
//  • assinante / admin → dashboard do app
function destinoPosLogin(user: { role?: string; hasPlatformAccess?: boolean } | undefined): string {
  if (user?.role === "coproducer") return "/coproducer";
  if (user?.hasPlatformAccess === false) return "/forja";
  return "/dashboard";
}

// Painel de marca (lado esquerdo, só desktop) — o que a pessoa reencontra
// ao entrar. Mesmos nomes do menu da plataforma.
const HERO_POINTS = [
  { icon: "🛰️", title: "Radar", desc: "Leads qualificados do Google Maps em minutos" },
  { icon: "🚀", title: "Disparador", desc: "Campanhas no WhatsApp com ritmo seguro" },
  { icon: "🎓", title: "Cursos e mentorias", desc: "Área de membros + sessões ao vivo semanais" },
  { icon: "🛟", title: "Suporte direto", desc: "A equipe a uma mensagem de distância" },
];

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "recover">("login");
  const [showPass, setShowPass] = useState(false);

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");
  // Auto-login do botão do e-mail (?al=<token>): entra sem digitar senha.
  const [autoLoggingIn, setAutoLoggingIn] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const al = params.get("al");
    if (!al) return;
    setAutoLoggingIn(true);
    // Limpa o token da URL já (não deixar em histórico/compartilhamento).
    window.history.replaceState(null, "", window.location.pathname);
    fetch(`${API_URL}/api/auth/auto-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: al }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.token) throw new Error(d.error || "Não foi possível entrar pelo link.");
        localStorage.setItem("cz_token", d.token);
        localStorage.setItem("cz_user", JSON.stringify(d.user));
        window.location.href = destinoPosLogin(d.user);
      })
      .catch((e) => {
        setAutoLoggingIn(false);
        setLoginNotice(e?.message || "Link expirado — entre com e-mail e senha.");
      });
  }, []);

  // Recovery state — 3 steps: 1) e-mail, 2) WhatsApp, 3) code + new password.
  const [recoverStep, setRecoverStep] = useState<1 | 2 | 3>(1);
  const [recoverEmail, setRecoverEmail] = useState("");
  const [recoverPhone, setRecoverPhone] = useState("");
  const [recoverCode, setRecoverCode] = useState("");
  const [recoverNewPass, setRecoverNewPass] = useState("");
  const [recoverMsg, setRecoverMsg] = useState("");
  const [recoverError, setRecoverError] = useState("");
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [phoneHint, setPhoneHint] = useState<string | null>(null);
  const [notSubscriber, setNotSubscriber] = useState(false);

  // E-mail recovery (alternative to the WhatsApp flow): we send a reset link to
  // the account e-mail and confirm on screen. `emailSent` flips to the
  // confirmation view; the actual reset happens on /recuperar.
  const [emailSent, setEmailSent] = useState(false);

  // Where a non-subscriber is sent to buy a plan.
  const SUBSCRIBE_URL = "https://czero.sbs";

  const resetRecovery = () => {
    setRecoverStep(1);
    setRecoverEmail("");
    setRecoverPhone("");
    setRecoverCode("");
    setRecoverNewPass("");
    setRecoverMsg("");
    setRecoverError("");
    setPhoneHint(null);
    setNotSubscriber(false);
    setEmailSent(false);
  };

  // E-mail recovery — always succeeds generically (the backend never reveals
  // whether the account exists). We just confirm "check your inbox".
  const requestEmailReset = async () => {
    setRecoverError("");
    setRecoverMsg("");
    if (!recoverEmail.trim()) {
      setRecoverError("Informe o e-mail da conta para receber o link.");
      return;
    }
    setRecoverLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/email-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoverEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar o e-mail");
      setEmailSent(true);
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "Erro ao enviar o e-mail.");
    }
    setRecoverLoading(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Credenciais inválidas");
      }

      localStorage.setItem("cz_token", data.token);
      localStorage.setItem("cz_user", JSON.stringify(data.user));
      window.location.href = destinoPosLogin(data.user);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer login.";
      setError(msg);
      setLoading(false);
    }
  };

  // STEP 1 — confirm the e-mail belongs to a paid account before anything else.
  const checkEmail = async (e: FormEvent) => {
    e.preventDefault();
    setRecoverError("");
    setRecoverMsg("");
    setNotSubscriber(false);
    setRecoverLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/check-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoverEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao verificar e-mail");
      if (!data.subscriber) {
        // Not a paying customer → show the "become a subscriber" CTA. No code sent.
        setNotSubscriber(true);
      } else if (data.noPhone) {
        setRecoverError("Esta conta não tem WhatsApp cadastrado. Fale com o suporte.");
      } else {
        setPhoneHint(data.phoneHint || null);
        setRecoverStep(2);
      }
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "Erro ao verificar e-mail.");
    }
    setRecoverLoading(false);
  };

  // STEP 2 — the WhatsApp number must match the one on file; only then is a code sent.
  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setRecoverError("");
    setRecoverMsg("");
    setRecoverLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoverEmail, phone: recoverPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.notSubscriber) { setNotSubscriber(true); return; }
        throw new Error(data.error || "Erro ao solicitar código");
      }
      setRecoverMsg(data.message || "Enviamos um código pelo WhatsApp.");
      setRecoverStep(3);
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "Erro ao solicitar código.");
    }
    setRecoverLoading(false);
  };

  // STEP 3 — confirm the code and set the new password.
  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setRecoverError("");
    setRecoverMsg("");
    setRecoverLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoverEmail, code: recoverCode, newPassword: recoverNewPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao redefinir senha");
      // Back to login with a success banner.
      setMode("login");
      setError("");
      resetRecovery();
      setLoginNotice("Senha redefinida! Faça login com a nova senha.");
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "Erro ao redefinir senha.");
    }
    setRecoverLoading(false);
  };

  if (autoLoggingIn) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, background: "#001412", color: "#EAF2F0", fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <Logo size={40} variant="mark" />
        <p style={{ fontSize: 15, color: "#93A69F" }}>Entrando na sua conta…</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ── Painel de marca (desktop: coluna esquerda; mobile: cabeçalho compacto) ── */}
      <aside className={styles.heroSide}>
        <div className={styles.heroInner}>
          <Logo size={34} />
          <h1 className={styles.heroTitle}>
            Sua operação de <span className={styles.heroHl}>IA</span> começa aqui.
          </h1>
          <p className={styles.heroDesc}>
            Tudo que você precisa pra encontrar clientes, vender e entregar — num lugar só.
          </p>
          <div className={styles.heroList}>
            {HERO_POINTS.map((p) => (
              <div key={p.title} className={styles.heroItem}>
                <span className={styles.heroItemIcon}>{p.icon}</span>
                <span className={styles.heroItemText}>
                  <strong>{p.title}</strong>
                  <span>{p.desc}</span>
                </span>
              </div>
            ))}
          </div>
          <div className={styles.heroFoot}>Código Zero · IA na prática · @eusouangelodeixa</div>
        </div>
      </aside>

      {/* ── Formulário ── */}
      <div className={styles.formSide}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.brandLogoMobile}><Logo size={38} /></span>
          <h2 className={styles.formTitle}>
            {mode === "login" ? "Bem-vindo de volta" : "Recuperar acesso"}
          </h2>
          <p className={styles.subtitle}>
            {mode === "login" ? "Entre pra continuar de onde parou." : "Vamos te devolver o acesso em instantes."}
          </p>
        </div>

        {mode === "login" ? (
          <>
            <form onSubmit={handleSubmit} className={styles.form}>
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
              />

              <div className={styles.passWrap}>
                <Input
                  label="Senha"
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.passToggle}
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPass ? "Ocultar" : "Mostrar"}
                </button>
              </div>

              {loginNotice && (
                <div className={styles.notice} role="status">{loginNotice}</div>
              )}
              {error && (
                <div className={styles.error} role="alert">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 7.25a.75.75 0 01-1.5 0v-2.5a.75.75 0 011.5 0v2.5z" />
                  </svg>
                  {error}
                </div>
              )}

              <Button type="submit" variant="primary" size="lg" loading={loading} fullWidth>
                Entrar na plataforma
              </Button>
            </form>

            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => { setMode("recover"); setError(""); setLoginNotice(""); resetRecovery(); }}
            >
              Esqueci minha senha
            </button>

            <p className={styles.footer}>
              Suas credenciais foram enviadas por WhatsApp após a compra.
            </p>
          </>
        ) : (
          <>
            {notSubscriber ? (
              <div className={styles.subscriberBox}>
                <div className={styles.subscriberTitle}>Este e-mail não é de um assinante</div>
                <p className={styles.subscriberText}>
                  Não encontramos um plano pago vinculado a este e-mail. A recuperação de senha
                  é exclusiva para assinantes. Para acessar a plataforma, torne-se assinante.
                </p>
                <a className={styles.ctaLink} href={SUBSCRIBE_URL} target="_blank" rel="noopener noreferrer">
                  Tornar-se assinante
                </a>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => { setNotSubscriber(false); setRecoverStep(1); setRecoverError(""); }}
                >
                  ← Tentar com outro e-mail
                </button>
              </div>
            ) : emailSent ? (
              <div className={styles.subscriberBox}>
                <div className={styles.subscriberTitle}>Verifique seu e-mail</div>
                <p className={styles.subscriberText}>
                  Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.
                  O link expira em 1 hora. Confira também a caixa de spam.
                </p>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => { setEmailSent(false); setRecoverError(""); setRecoverMsg(""); }}
                >
                  ← Voltar
                </button>
              </div>
            ) : recoverStep === 1 ? (
              <form onSubmit={checkEmail} className={styles.form}>
                <p className={styles.helpText}>
                  Informe o e-mail da sua conta. Se houver um plano pago vinculado a ele,
                  liberamos a verificação pelo WhatsApp.
                </p>
                <Input
                  label="E-mail da conta"
                  type="email"
                  value={recoverEmail}
                  onChange={(e) => setRecoverEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  autoComplete="email"
                />
                {recoverError && <div className={styles.error} role="alert">{recoverError}</div>}
                <Button type="submit" variant="primary" size="lg" loading={recoverLoading} fullWidth>
                  Continuar com WhatsApp
                </Button>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={requestEmailReset}
                  disabled={recoverLoading}
                >
                  Prefiro receber um link por e-mail
                </button>
              </form>
            ) : recoverStep === 2 ? (
              <form onSubmit={requestCode} className={styles.form}>
                <p className={styles.helpText}>
                  Confirme o número de WhatsApp cadastrado nesta conta. Se conferir, enviamos um
                  código de verificação por lá.
                </p>
                {phoneHint && (
                  <p className={styles.phoneHint}>
                    Número cadastrado: <strong>{phoneHint}</strong>
                  </p>
                )}
                <Input
                  label="WhatsApp cadastrado"
                  type="tel"
                  value={recoverPhone}
                  onChange={(e) => setRecoverPhone(e.target.value)}
                  placeholder="Ex: 84 123 4567"
                  required
                  autoComplete="tel"
                />
                {recoverError && <div className={styles.error} role="alert">{recoverError}</div>}
                <Button type="submit" variant="primary" size="lg" loading={recoverLoading} fullWidth>
                  Enviar código
                </Button>
                <button type="button" className={styles.linkBtn} onClick={() => { setRecoverStep(1); setRecoverError(""); }}>
                  ← Usar outro e-mail
                </button>
              </form>
            ) : (
              <form onSubmit={resetPassword} className={styles.form}>
                {recoverMsg && <div className={styles.notice} role="status">{recoverMsg}</div>}
                <Input
                  label="Código recebido"
                  inputMode="numeric"
                  value={recoverCode}
                  onChange={(e) => setRecoverCode(e.target.value)}
                  placeholder="000000"
                  required
                />
                <Input
                  label="Nova senha"
                  type="password"
                  value={recoverNewPass}
                  onChange={(e) => setRecoverNewPass(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  autoComplete="new-password"
                />
                {recoverError && <div className={styles.error} role="alert">{recoverError}</div>}
                <Button type="submit" variant="primary" size="lg" loading={recoverLoading} fullWidth>
                  Redefinir senha
                </Button>
                <button type="button" className={styles.linkBtn} onClick={() => { setRecoverStep(2); setRecoverError(""); }}>
                  Não recebi o código — voltar
                </button>
              </form>
            )}

            {!notSubscriber && (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => { setMode("login"); resetRecovery(); }}
              >
                ← Voltar para o login
              </button>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
