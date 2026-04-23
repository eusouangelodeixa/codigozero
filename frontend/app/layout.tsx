import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Código Zero — Plataforma de Micronegócios de IA",
  description: "Crie e venda automações de Inteligência Artificial sem escrever uma linha de código. Gere seus primeiros 50.000 MT/mês.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
