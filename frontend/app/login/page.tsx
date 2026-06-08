"use client";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { Button, Input } from "@/components/ui";
import styles from "./login.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "recover">("login");

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loginNotice, setLoginNotice] = useState("");

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
      const role = data.user?.role;
      window.location.href = role === "coproducer" ? "/coproducer" : "/dashboard";
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

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Logo size={40} />
          <p className={styles.subtitle}>
            {mode === "login" ? "Acesse sua área de membros" : "Recuperar acesso"}
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

              <Input
                label="Senha"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />

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
                  Continuar
                </Button>
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
  );
}
