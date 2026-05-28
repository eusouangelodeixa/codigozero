"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LandingPage, { type CoproducerContext } from "../../page";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * Coproducer landing — same page as /, but the lead capture form
 * tags the user with this coproducer's code, and the fallback checkout
 * URL points to the coproducer's own Lojou product.
 */
export default function CoproducerLandingPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = (params?.code ?? "").trim();

  const [resolved, setResolved] = useState<CoproducerContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/api/landing/resolve-coproducer/${encodeURIComponent(code)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error || "Código de coprodução não encontrado.");
          return;
        }
        setResolved({
          code: data.code,
          checkoutUrl: data.checkoutUrl,
          vslEmbedHtml: data.vslEmbedHtml ?? null,
          headScripts: data.headScripts ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Não foi possível validar o código agora.");
      });
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  if (error) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 24,
          background: "var(--bg-base)",
          color: "var(--text-primary)",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Link inválido</h1>
        <p style={{ color: "var(--text-tertiary)", maxWidth: 420 }}>{error}</p>
        <a
          href="/"
          style={{
            marginTop: 12,
            padding: "12px 20px",
            borderRadius: 8,
            background: "var(--accent)",
            color: "var(--accent-fg)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Ir para a página principal
        </a>
      </main>
    );
  }

  if (!resolved) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-base)",
          color: "var(--text-tertiary)",
        }}
      >
        <span>Carregando…</span>
      </main>
    );
  }

  return <LandingPage coproducerContext={resolved} />;
}
