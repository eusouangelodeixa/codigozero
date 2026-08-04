"use client";
// Ponte SSO app → members: o app navega para /sso#code=…(&to=/slug). O código
// de uso único (60s) vem no FRAGMENT (nunca em query — fragments não chegam a
// logs de servidor) e é trocado aqui pelo JWT normal.
import { useEffect, useState } from "react";
import { MEMBERS_API } from "@/lib/members/api";
import { memberGo } from "@/lib/members/nav";
import k from "@/components/members/kit.module.css";

export default function MembersSso() {
  const [error, setError] = useState("");

  useEffect(() => {
    const frag = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const code = frag.get("code") || "";
    const to = frag.get("to") || "/";
    // Limpa o fragment da barra imediatamente (não deixar o código visível).
    window.history.replaceState(null, "", window.location.pathname);
    if (!code) {
      memberGo("/login");
      return;
    }
    fetch(`${MEMBERS_API}/api/members/sso/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.token) throw new Error(d.error || "Falha na autenticação");
        localStorage.setItem("cz_token", d.token);
        localStorage.setItem("cz_user", JSON.stringify(d.user));
        memberGo(to);
      })
      .catch((e) => setError(e?.message || "Falha na autenticação"));
  }, []);

  return (
    <div className={k.centerLoad} style={{ minHeight: "100dvh", flexDirection: "column", gap: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {error ? (
        <>
          <span style={{ color: "#fca5a5" }}>{error}</span>
          <a href="/login" style={{ color: "#2DD4BF" }} onClick={(e) => { e.preventDefault(); memberGo("/login"); }}>
            Entrar com e-mail e senha →
          </a>
        </>
      ) : (
        "Entrando na área de membros…"
      )}
    </div>
  );
}
