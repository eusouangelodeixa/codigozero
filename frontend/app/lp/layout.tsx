import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";

// Route-scoped typefaces for the reels LP (a distinct sub-brand from the
// teal app). Self-hosted by next/font; exposed as CSS variables consumed by
// lp.module.css. The global Sora stays untouched for the rest of the app.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--lp-display",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--lp-body",
  display: "swap",
});

const TITLE = "Resgate o material dos Reels — Código Zero";
const DESC =
  "Guias, prompts e setups de IA e Claude Code que apareço usando nos reels — num lugar só. Preenche e resgata.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  openGraph: {
    title: TITLE,
    description: DESC,
    type: "website",
    locale: "pt_BR",
    siteName: "Código Zero",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC },
};

export default function LpLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${playfair.variable} ${inter.variable}`}>{children}</div>;
}
