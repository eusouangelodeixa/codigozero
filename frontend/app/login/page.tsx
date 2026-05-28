"use client";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/Logo";
import { Button, Input } from "@/components/ui";
import styles from "./login.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      // Coproducers go straight to their own dashboard — they don't have
      // a member subscription and shouldn't see /dashboard's member UI.
      const role = data.user?.role;
      window.location.href = role === "coproducer" ? "/coproducer" : "/dashboard";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao fazer login.";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <span className={styles.logoWrap}>
            <Logo size={32} />
          </span>
          <h1 className={styles.title}>Código Zero</h1>
          <p className={styles.subtitle}>Acesse sua área de membros</p>
        </div>

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

        <p className={styles.footer}>
          Suas credenciais foram enviadas por WhatsApp após a compra.
        </p>
      </div>
    </div>
  );
}
