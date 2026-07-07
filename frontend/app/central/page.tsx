import type { Metadata } from "next";
import CentralClient from "./CentralClient";

// central.czero.sbs — the Central de Material hub. A grid of published
// ContentPages; tapping a card opens the guide UNGATED in a modal (the lead
// already arrived via the LP / WhatsApp group). Served on the central.czero.sbs
// host via nginx; also reachable at /central on any host. The standalone
// /conteudo/{slug} page keeps its gate for cold IG traffic.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const HUB_TITLE = "Central de Material — Código Zero";
const HUB_DESC =
  "Todo o material prático de IA e Claude Code que apareço usando nos reels, num lugar só. Escolhe e resgata o passo a passo.";

// Deep-linked guide (?m=slug) gets its own share preview so links posted in the
// group render the material's OG. Fetch WITHOUT ?track so crawlers don't count views.
async function fetchGuideMeta(slug: string) {
  try {
    const r = await fetch(`${API}/api/content/resolve/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d.page || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ m?: string }> }): Promise<Metadata> {
  const { m } = await searchParams;
  if (m) {
    const p = await fetchGuideMeta(m);
    if (p) {
      const title = p.metaTitle || p.title;
      const description = p.metaDescription || HUB_DESC;
      const images = p.ogImageUrl ? [p.ogImageUrl] : undefined;
      return {
        title,
        description,
        openGraph: { title, description, images, type: "article" },
        twitter: { card: "summary_large_image", title, description, images },
      };
    }
  }
  return {
    title: HUB_TITLE,
    description: HUB_DESC,
    openGraph: { title: HUB_TITLE, description: HUB_DESC, type: "website", locale: "pt_BR", siteName: "Código Zero" },
    twitter: { card: "summary_large_image", title: HUB_TITLE, description: HUB_DESC },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  return <CentralClient initialSlug={m || null} />;
}
