import type { Metadata } from "next";
import type { ReactNode } from "react";

// Casca da área de membros (members.czero.sbs). Sem AppShell do app, sem
// registro de service worker (o PWA é exclusivo do app.czero.sbs — o script
// no layout raiz é gateado por hostname e o nginx do subdomínio devolve 404
// para /sw.js e /manifest.json).
export const metadata: Metadata = {
  title: "Área de Membros — Código Zero",
  description: "Seus cursos do Código Zero em um só lugar.",
  robots: { index: false },
};

export default function MembersLayout({ children }: { children: ReactNode }) {
  return <div style={{ minHeight: "100dvh", background: "#0a0a0a" }}>{children}</div>;
}
