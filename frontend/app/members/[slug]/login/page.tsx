"use client";
// Login TEMATIZADO por curso (bg, logo, layout barra lateral|toda a tela,
// cor primária) — visual vem do endpoint público login-config (whitelist:
// nunca inclui o menu). Mesmas credenciais do app.
import { use, useEffect, useState } from "react";
import { ThemeVars } from "@/components/members/ThemeVars";
import { LoginCard } from "@/components/members/LoginCard";
import { MEMBER_DEFAULTS, mergeMemberConfig, type MemberConfig } from "@/lib/members/defaults";
import { MEMBERS_API } from "@/lib/members/api";
import { memberGo } from "@/lib/members/nav";
import k from "@/components/members/kit.module.css";

export default function CourseLogin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [config, setConfig] = useState<MemberConfig | null>(null);
  const [courseName, setCourseName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${MEMBERS_API}/api/members/courses/${encodeURIComponent(slug)}/login-config`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        setCourseName(d.name || "");
        setConfig(mergeMemberConfig({ theme: d.theme, branding: d.branding }));
        if (d.branding?.faviconUrl) {
          const link = document.createElement("link");
          link.rel = "icon";
          link.href = d.branding.faviconUrl;
          document.head.appendChild(link);
        }
        if (d.name) document.title = `${d.name} — Área de Membros`;
      })
      .catch(() => setConfig(MEMBER_DEFAULTS));
  }, [slug]);

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
      memberGo(`/${slug}`);
    } catch (e: any) {
      setError(e?.message || "Não foi possível entrar.");
    } finally {
      setLoading(false);
    }
  };

  if (!config) return <div className={k.centerLoad} style={{ minHeight: "100dvh" }}>Carregando…</div>;

  return (
    <ThemeVars config={config}>
      <LoginCard
        config={config}
        courseName={courseName || "Área de Membros"}
        loading={loading}
        error={error}
        onSubmit={submit}
      />
    </ThemeVars>
  );
}
