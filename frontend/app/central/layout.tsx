import { Playfair_Display, Inter } from "next/font/google";

// Route-scoped typefaces for the Central de Material hub (same contract as
// app/lp: exposes --lp-display / --lp-body so central.module.css shares the LP
// token names). The global Sora stays untouched for the rest of the app.
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

export default function CentralLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${playfair.variable} ${inter.variable}`}>{children}</div>;
}
