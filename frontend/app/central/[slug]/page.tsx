// central.czero.sbs/{slug} — página REAL do material (antes era um modal
// ?m=slug por cima da grade). Server component: OG/SEO próprios via
// generateMetadata, conteúdo ungated (o lead já chegou pelo grupo/LP), CTA
// final pro Código Zero e link de volta pra Central. O /conteudo/{slug}
// (gate para tráfego frio) continua intocado.
import type { Metadata } from "next";
import { headers } from "next/headers";
import { BlockList, type Block } from "@/components/content/BlockView";
import { TrackView } from "./TrackView";
import styles from "../central.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const DEFAULT_CTA_URL = "https://czero.sbs";
const DEFAULT_CTA_TEXT = "Conhecer o Código Zero →";
const FOOTER = "Código Zero · IA · Claude Code na prática · @eusouangelodeixa";

interface Guide {
  slug: string;
  title: string;
  theme?: string | null;
  blocks: Block[];
  ctaText?: string | null;
  ctaUrl?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogImageUrl?: string | null;
}

// Fetch SEM ?track — crawlers e o render do servidor não contam view (o
// TrackView cliente conta uma vez, como o modal antigo fazia).
async function fetchGuide(slug: string): Promise<Guide | null> {
  try {
    const r = await fetch(`${API}/api/content/resolve/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d.page || null;
  } catch {
    return null;
  }
}

// Base do link "voltar": na origem central.czero.sbs a raiz já é o hub; em
// app.czero.sbs/central/{slug} o hub fica em /central.
async function hubHref(): Promise<string> {
  const host = (await headers()).get("host") || "";
  return host.startsWith("central.") ? "/" : "/central";
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await fetchGuide(slug);
  if (!p) return { title: "Material não encontrado — Central de Material" };
  const title = p.metaTitle || p.title;
  const description = p.metaDescription || "Material prático de IA e Claude Code — Central de Material do Código Zero.";
  const images = p.ogImageUrl ? [p.ogImageUrl] : undefined;
  return {
    title: `${title} — Central de Material`,
    description,
    openGraph: { title, description, images, type: "article" },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function MaterialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [guide, hub] = await Promise.all([fetchGuide(slug), hubHref()]);

  if (!guide) {
    return (
      <div className={styles.page}>
        <div className={styles.matShell}>
          <a className={styles.backLink} href={hub}>← Central de Material</a>
          <div className={styles.state}>Material não encontrado — pode ter sido movido ou despublicado.</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <TrackView slug={guide.slug} />
      <div className={styles.matShell}>
        <a className={styles.backLink} href={hub}>← Central de Material</a>

        <article>
          <div className={styles.guideEyebrow}>✦ CÓDIGO ZERO · IA NA PRÁTICA</div>
          <h1 className={styles.guideTitle}>{guide.title}</h1>
          <div className={styles.guideRule} />
          <div className={styles.guideBody}>
            <BlockList blocks={guide.blocks} />
          </div>
        </article>

        <div className={styles.ctaCard}>
          <div className={styles.ctaEyebrow}>Material parado não muda nada</div>
          <h3 className={styles.ctaTitle}>Pegou o passo a passo. E agora?</h3>
          <p className={styles.ctaDesc}>
            Material salvo que você não executa não muda nada. No Código Zero eu mostro ao vivo como uso isso no
            trabalho real — e você executa comigo do lado.
          </p>
          <a className={styles.ctaBtn} href={guide.ctaUrl || DEFAULT_CTA_URL} target="_blank" rel="noopener noreferrer">
            {guide.ctaText || DEFAULT_CTA_TEXT}
          </a>
        </div>

        <div className={styles.footer}>{FOOTER}</div>
      </div>
    </div>
  );
}
