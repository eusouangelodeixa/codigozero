"use client";
// A Forja virou a área de membros multi-curso (members.czero.sbs). Esta
// página existe só como PONTE: links antigos, atalho do PWA e pushes que
// apontavam para /forja caem aqui e entram já logados via SSO de uso único.
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const MEMBERS_URL = "https://members.czero.sbs";

export default function ForjaRedirect() {
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("cz_token");
    if (!token) {
      window.location.href = "/login";
      return;
    }
    fetch(`${API}/api/auth/members-sso`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok || !d.code) throw new Error(d.error || "Falha ao abrir a área de membros");
        // Deep-link opcional: /forja?to=/slug cai direto no curso (o /sso do
        // members lê `to` do fragment). Só caminhos internos são aceitos.
        const to = new URLSearchParams(window.location.search).get("to") || "";
        const toFrag = to.startsWith("/") && !to.startsWith("//") ? `&to=${encodeURIComponent(to)}` : "";
        window.location.href = `${MEMBERS_URL}/sso#code=${encodeURIComponent(d.code)}${toFrag}`;
      })
      .catch((e) => setError(e?.message || "Falha ao abrir a área de membros"));
  }, []);

  return (
    <div style={{ minHeight: "60dvh", display: "grid", placeItems: "center", color: "var(--text-secondary)", textAlign: "center", padding: 20 }}>
      {error ? (
        <div>
          <p style={{ color: "var(--color-error)" }}>{error}</p>
          <a href={MEMBERS_URL} style={{ color: "var(--accent)" }}>
            Ir para a área de membros →
          </a>
        </div>
      ) : (
        <p>Abrindo a área de membros…</p>
      )}
    </div>
  );
}
