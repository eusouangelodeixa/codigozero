import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import CentralClient from "./CentralClient";

// central.czero.sbs — the Central de Material hub. A grid of published
// ContentPages; each card is a REAL page now (central.czero.sbs/{slug} →
// app/central/[slug]). Old deep-links ?m=slug (shared in the modal era)
// 307-redirect to the real page. Served on the central.czero.sbs host via
// nginx+proxy.ts; also reachable at /central on any host. The standalone
// /conteudo/{slug} page keeps its gate for cold IG traffic.
const HUB_TITLE = "Central de Material — Código Zero";
const HUB_DESC =
  "Todo o material prático de IA e Claude Code que apareço usando nos reels, num lugar só. Escolhe e resgata o passo a passo.";

export const metadata: Metadata = {
  title: HUB_TITLE,
  description: HUB_DESC,
  openGraph: { title: HUB_TITLE, description: HUB_DESC, type: "website", locale: "pt_BR", siteName: "Código Zero" },
  twitter: { card: "summary_large_image", title: HUB_TITLE, description: HUB_DESC },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const host = (await headers()).get("host") || "";
  const onCentralHost = host.startsWith("central.");
  // Links antigos do modal (?m=slug) caem na página real do material.
  if (m) redirect(onCentralHost ? `/${encodeURIComponent(m)}` : `/central/${encodeURIComponent(m)}`);
  return <CentralClient hrefBase={onCentralHost ? "/" : "/central/"} />;
}
