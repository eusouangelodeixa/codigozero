"use client";
// Página/cartão de login tematizado por curso (layout "toda a tela" com bg +
// cartão central, ou "barra lateral" com formulário à esquerda e arte à
// direita) — fiel ao editor de Login da Kiwify. Puro/props-driven: usado pela
// página pública de login do curso e pelo preview do editor.
import { useState, type FormEvent } from "react";
import k from "./kit.module.css";
import type { MemberConfig } from "@/lib/members/defaults";

export function LoginCard({
  config,
  courseName,
  headline = "Acessar área de membros",
  loading,
  error,
  onSubmit,
  previewMode,
}: {
  config: MemberConfig;
  courseName: string;
  headline?: string;
  loading?: boolean;
  error?: string;
  onSubmit?: (email: string, password: string) => void;
  previewMode?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (previewMode || loading) return;
    onSubmit?.(email.trim(), password);
  };

  const card = (
    <div className={k.loginCard}>
      <div className={k.loginLogoStrip}>
        {config.branding.logoUrl ? (
          <img src={config.branding.logoUrl} alt={courseName} />
        ) : (
          <strong style={{ color: "#fff", fontSize: 16 }}>{courseName}</strong>
        )}
      </div>
      <form className={k.loginBody} onSubmit={submit}>
        <input
          className={k.loginInput}
          type="email"
          placeholder="Seu e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className={k.loginInput}
          type="password"
          placeholder="Sua senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {error && <div className={k.loginErr}>{error}</div>}
        <button type="submit" className={k.loginBtn} disabled={loading}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <div className={k.loginFoot}>
        {/* /resgate = auto-serviço (informa e-mail/telefone → reenviamos o
            acesso aos canais cadastrados). O /recuperar antigo era só a
            página de DESTINO do e-mail (sem ?token= dava beco sem saída). */}
        Esqueceu a senha? <a href="https://app.czero.sbs/resgate">Recuperar acesso</a>
      </div>
    </div>
  );

  if (config.branding.loginLayout === "sidebar") {
    return (
      <div className={k.loginSplit}>
        <div className={k.loginSplitForm}>
          <div style={{ width: "100%", display: "grid", placeItems: "center", gap: 16 }}>
            <h1 className={k.loginHeadline} style={{ textShadow: "none" }}>{headline}</h1>
            {card}
          </div>
        </div>
        <div
          className={k.loginSplitArt}
          style={config.branding.loginBgUrl ? { backgroundImage: `url(${config.branding.loginBgUrl})` } : undefined}
        />
      </div>
    );
  }

  return (
    <div
      className={k.loginFull}
      style={config.branding.loginBgUrl ? { backgroundImage: `url(${config.branding.loginBgUrl})` } : undefined}
    >
      <div>
        <h1 className={k.loginHeadline}>{headline}</h1>
        {card}
      </div>
    </div>
  );
}
