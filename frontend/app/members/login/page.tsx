"use client";
// Login genérico da área de membros (marca Código Zero). O login tematizado
// por curso vive em /[slug]/login. Mesmas credenciais do app.
import { useState } from "react";
import k from "@/components/members/kit.module.css";
import { LoginCard } from "@/components/members/LoginCard";
import { MEMBER_DEFAULTS } from "@/lib/members/defaults";
import { MEMBERS_API } from "@/lib/members/api";
import { memberGo } from "@/lib/members/nav";

export default function MembersLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (email: string, password: string) => {
    if (!email || !password) {
      setError("Informe e-mail e senha.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${MEMBERS_API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível entrar.");
      localStorage.setItem("cz_token", d.token);
      localStorage.setItem("cz_user", JSON.stringify(d.user));
      memberGo("/");
    } catch (e: any) {
      setError(e?.message || "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ["--accent" as any]: "#2DD4BF", ["--accent-fg" as any]: "#001412" }} className={undefined}>
      <LoginCard
        config={MEMBER_DEFAULTS}
        courseName="Código Zero"
        headline="Acessar área de membros"
        loading={loading}
        error={error}
        onSubmit={submit}
      />
    </div>
  );
}
