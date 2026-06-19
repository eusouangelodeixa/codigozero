"use client";

/* ═══════════════════════════════════════════════════════════
   Global Error Boundary
   Last line of defense — catches errors thrown by the ROOT
   layout/template, which app/error.tsx cannot reach. When
   active it REPLACES the root layout, so it must render its
   own <html> and <body>. Styles are inlined on purpose:
   globals.css / next/font may not be applied here, so we keep
   it fully self-contained.
   ═══════════════════════════════════════════════════════════ */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  const fontStack =
    'var(--font-sora), -apple-system, system-ui, "Segoe UI", Roboto, sans-serif';

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background: "#001412",
          color: "#FFFFFF",
          fontFamily: fontStack,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <title>Algo deu errado · Código Zero</title>
        <div style={{ maxWidth: 460, width: "100%", textAlign: "center" }}>
          <div
            style={{
              width: 72,
              height: 72,
              margin: "0 auto 24px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
            }}
          >
            <svg
              width={32}
              height={32}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: "clamp(1.5rem, 3.5vw, 2rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              margin: "0 0 12px",
            }}
          >
            Algo deu errado
          </h1>
          <p
            style={{
              fontSize: "0.9375rem",
              color: "#A1A1AA",
              lineHeight: 1.6,
              margin: "0 0 32px",
            }}
          >
            Ocorreu um erro inesperado na plataforma. Tente novamente ou volte
            para o início.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "stretch",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                width: "100%",
                padding: "14px 24px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
                background: "#FFFFFF",
                color: "#001412",
                fontFamily: "inherit",
                fontSize: "0.9375rem",
                fontWeight: 600,
              }}
            >
              Tentar novamente
            </button>
            <a
              href="/"
              style={{
                width: "100%",
                padding: "14px 24px",
                borderRadius: 10,
                boxSizing: "border-box",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "#A1A1AA",
                fontSize: "0.9375rem",
                fontWeight: 500,
                textDecoration: "none",
                display: "block",
              }}
            >
              Voltar ao início
            </a>
          </div>

          {error?.digest && (
            <p
              style={{
                marginTop: 20,
                fontFamily: '"SF Mono", "Fira Code", monospace',
                fontSize: "0.6875rem",
                color: "#52525B",
                wordBreak: "break-all",
              }}
            >
              Código do erro: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
