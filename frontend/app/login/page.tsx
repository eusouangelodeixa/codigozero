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

  // Recovery state
  const [recoverStep, setRecoverStep] = useState<1 | 2>(1);
  const [recoverPhone, setRecoverPhone] = useState("");
  const [recoverCode, setRecoverCode] = useState("");
  const [recoverNewPass, setRecoverNewPass] = useState("");
  const [recoverMsg, setRecoverMsg] = useState("");
  const [recoverError, setRecoverError] = useState("");
  const [recoverLoading, setRecoverLoading] = useState(false);

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

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setRecoverError("");
    setRecoverMsg("");
    setRecoverLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: recoverPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao solicitar código");
      setRecoverMsg(data.message || "Se o número estiver cadastrado, enviamos um código pelo WhatsApp.");
      setRecoverStep(2);
    } catch (err) {
      setRecoverError(err instanceof Error ? err.message : "Erro ao solicitar código.");
    }
    setRecoverLoading(false);
  };

  const resetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setRecoverError("");
    setRecoverMsg("");
    setRecoverLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: recoverPhone, code: recoverCode, newPassword: recoverNewPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao redefinir senha");
      // Back to login with a success banner.
      setMode("login");
      setError("");
      setRecoverStep(1);
      setRecoverCode("");
      setRecoverNewPass("");
      setRecoverPhone("");
      setRecoverMsg("");
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
          <span className={styles.logoWrap}>
            <Logo size={32} />
          </span>
          <h1 className={styles.title}>Código Zero</h1>
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
              onClick={() => { setMode("recover"); setError(""); setLoginNotice(""); }}
            >
              Esqueci minha senha
            </button>

            <p className={styles.footer}>
              Suas credenciais foram enviadas por WhatsApp após a compra.
            </p>
          </>
        ) : (
          <>
            {recoverStep === 1 ? (
              <form onSubmit={requestCode} className={styles.form}>
                <p className={styles.helpText}>
                  Informe o número de telefone cadastrado no sistema. Enviaremos um código de verificação pelo WhatsApp.
                </p>
                <Input
                  label="Telefone (WhatsApp)"
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
                <button type="button" className={styles.linkBtn} onClick={() => setRecoverStep(1)}>
                  Não recebi o código — reenviar
                </button>
              </form>
            )}

            <button
              type="button"
              className={styles.linkBtn}
              onClick={() => { setMode("login"); setRecoverStep(1); setRecoverError(""); }}
            >
              ← Voltar para o login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
