"use client";
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Button, Input } from "@/components/ui";
import styles from "./recuperar.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Inner component: reads ?token= from the URL. Because useSearchParams suspends
// during prerender, it MUST live under a <Suspense> boundary (see default export).
function RecuperarForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Link inválido ou incompleto. Solicite um novo e-mail de recuperação.");
      return;
    }
    if (newPass.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPass !== confirmPass) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password/email-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao redefinir senha");
      setDone(true);
      // Send them to login (with the success banner the login page shows).
      setTimeout(() => router.push("/login"), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir senha.");
      setLoading(false);
    }
  };

  // Missing token → guide the user back to request a fresh link.
  if (!token) {
    return (
      <div className={styles.subscriberBox}>
        <div className={styles.subscriberTitle}>Link inválido</div>
        <p className={styles.subscriberText}>
          Este link de recuperação está incompleto ou expirou. Solicite um novo na tela de login.
        </p>
        <button type="button" className={styles.linkBtn} onClick={() => router.push("/login")}>
          ← Voltar para o login
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className={styles.subscriberBox}>
        <div className={styles.subscriberTitle}>Senha redefinida! 🎉</div>
        <p className={styles.subscriberText}>
          Tudo certo. Estamos te levando de volta para o login…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={styles.form}>
      <p className={styles.helpText}>Crie uma nova senha para a sua conta.</p>
      <Input
        label="Nova senha"
        type="password"
        value={newPass}
        onChange={(e) => setNewPass(e.target.value)}
        placeholder="Mínimo 6 caracteres"
        required
        autoComplete="new-password"
      />
      <Input
        label="Confirmar nova senha"
        type="password"
        value={confirmPass}
        onChange={(e) => setConfirmPass(e.target.value)}
        placeholder="Repita a senha"
        required
        autoComplete="new-password"
      />
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
      <Button type="submit" variant="primary" size="lg" loading={loading} fullWidth>
        Redefinir senha
      </Button>
      <button type="button" className={styles.linkBtn} onClick={() => router.push("/login")}>
        ← Voltar para o login
      </button>
    </form>
  );
}

export default function RecuperarPage() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <Logo size={40} />
          <p className={styles.subtitle}>Redefinir senha</p>
        </div>
        <Suspense fallback={<p className={styles.helpText}>Carregando…</p>}>
          <RecuperarForm />
        </Suspense>
      </div>
    </div>
  );
}
