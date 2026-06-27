import type { Metadata } from "next";
import ContentPageClient from "./ContentPageClient";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Fetch WITHOUT ?track so link-preview crawlers / SSR don't inflate views.
async function fetchPage(slug: string) {
  try {
    const r = await fetch(`${API}/api/content/resolve/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d.page || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPage(slug);
  if (!page) return { title: "Conteúdo — Código Zero" };
  const title = page.metaTitle || page.title;
  const description = page.metaDescription || undefined;
  const images = page.ogImageUrl ? [page.ogImageUrl] : undefined;
  return {
    title,
    description,
    openGraph: { title, description, images, type: "article" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ContentPageClient slug={slug} />;
}
