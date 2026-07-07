"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import styles from "./central.module.css";
import { BlockList, type Block } from "@/components/content/BlockView";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Header/footer identity — kept here (not admin-editable) since the hub is a
// single page. Matches the LP funnel voice.
const EYEBROW = "✦ CÓDIGO ZERO · @eusouangelodeixa";
const TITLE_PRE = "CENTRAL DE";
const TITLE_HL = "MATERIAL";
const SUBTITLE = "Todo o material prático de IA e Claude Code que apareço usando nos reels, num lugar só. Escolhe e resgata o passo a passo.";
const SEARCH_PLACEHOLDER = "Comentou uma palavra? Busca aqui";
const FOOTER = "Código Zero · IA · Claude Code na prática · @eusouangelodeixa";
const DEFAULT_CTA_URL = "https://czero.sbs";
const DEFAULT_CTA_TEXT = "Conhecer o Código Zero →";

type CardItem = {
  slug: string; title: string; theme: string | null;
  ogImageUrl: string | null; metaDescription: string | null;
  createdAt: string;
};
type Guide = {
  slug: string; title: string; theme?: string | null; blocks: Block[];
  ctaText?: string | null; ctaUrl?: string | null;
};

export default function CentralClient({ initialSlug }: { initialSlug?: string | null }) {
  const [pages, setPages] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [openSlug, setOpenSlug] = useState<string | null>(initialSlug || null);
  const [guide, setGuide] = useState<Guide | null>(null);
  // Start "loading" when we land on a deep-linked guide so the first paint shows
  // "Carregando…" rather than a flash of "não encontrado".
  const [guideLoading, setGuideLoading] = useState(!!initialSlug);
  const scrollYRef = useRef(0);

  // Load the catalog + paint the warm-teal background over the global app body.
  useEffect(() => {
    fetch(`${API}/api/content/list`)
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((d) => setPages(Array.isArray(d.pages) ? d.pages : []))
      .catch(() => setPages([]))
      .finally(() => setLoading(false));

    const prevBg = document.body.style.background;
    document.body.style.background = "#001412";
    return () => { document.body.style.background = prevBg; };
  }, []);

  // History: seed a grid entry behind a deep-linked modal (so Back closes to the
  // grid, not off-site), and sync openSlug from the ?m param on back/forward.
  useEffect(() => {
    if (initialSlug) {
      try {
        window.history.replaceState(null, "", window.location.pathname);
        window.history.pushState(null, "", `?m=${encodeURIComponent(initialSlug)}`);
      } catch {}
    }
    const onPop = () => {
      try { setOpenSlug(new URLSearchParams(window.location.search).get("m")); }
      catch { setOpenSlug(null); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the guide when a card opens (track the view once per open).
  useEffect(() => {
    if (!openSlug) { setGuide(null); return; }
    let alive = true;
    setGuideLoading(true);
    setGuide(null);
    fetch(`${API}/api/content/resolve/${encodeURIComponent(openSlug)}?track=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setGuide(d?.page || null); })
      .catch(() => { if (alive) setGuide(null); })
      .finally(() => { if (alive) setGuideLoading(false); });
    return () => { alive = false; };
  }, [openSlug]);

  // Body scroll-lock (position:fixed — the only variant iOS honours) + Esc.
  useEffect(() => {
    if (!openSlug) return;
    const y = window.scrollY;
    scrollYRef.current = y;
    const b = document.body;
    b.style.position = "fixed";
    b.style.top = `-${y}px`;
    b.style.left = "0";
    b.style.right = "0";
    b.style.width = "100%";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      b.style.position = ""; b.style.top = ""; b.style.left = ""; b.style.right = ""; b.style.width = "";
      window.scrollTo(0, scrollYRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSlug]);

  const openCard = (slug: string) => {
    try { window.history.pushState(null, "", `?m=${encodeURIComponent(slug)}`); } catch {}
    setOpenSlug(slug);
  };
  // Back-navigate so the hardware/browser Back button and the URL stay in sync
  // (popstate flips openSlug to null). Seeding above guarantees an entry to pop.
  const close = () => { window.history.back(); };

  // Instant client-side search over title + theme + description.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) =>
      [p.title, p.theme, p.metaDescription].filter(Boolean).some((s) => (s as string).toLowerCase().includes(q))
    );
  }, [pages, query]);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>{EYEBROW}</div>
          <h1 className={styles.title}>
            {TITLE_PRE} <span className={styles.hl}>{TITLE_HL}</span>
          </h1>
          <p className={styles.subtitle}>{SUBTITLE}</p>
          <div className={styles.rule} />
        </header>

        <form className={styles.search} onSubmit={(e) => e.preventDefault()} role="search">
          <input
            className={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={SEARCH_PLACEHOLDER}
            aria-label="Buscar material"
          />
          <button className={styles.searchBtn} type="submit">Buscar</button>
        </form>
        {query && (
          <button className={styles.clearBtn} type="button" onClick={() => setQuery("")}>
            limpar busca ({filtered.length} {filtered.length === 1 ? "resultado" : "resultados"})
          </button>
        )}

        {loading ? (
          <div className={styles.state}>Carregando materiais…</div>
        ) : filtered.length === 0 ? (
          <div className={styles.state}>
            {pages.length === 0 ? "Em breve — os materiais estão sendo preparados." : "Nenhum material encontrado pra essa palavra."}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((p) => (
              <button key={p.slug} className={styles.card} type="button" onClick={() => openCard(p.slug)} aria-label={p.title}>
                <div className={styles.thumb}>
                  {p.ogImageUrl ? (
                    <img className={styles.thumbImg} src={p.ogImageUrl} alt="" loading="lazy" />
                  ) : (
                    <div className={styles.thumbFallback} aria-hidden>
                      <span className={styles.thumbMark}>✦</span>
                    </div>
                  )}
                  <span className={styles.thumbOverlay} aria-hidden>Resgatar material →</span>
                </div>
                <h3 className={styles.cardTitle}>{p.title}</h3>
                {p.metaDescription && <p className={styles.cardDesc}>{p.metaDescription}</p>}
              </button>
            ))}
          </div>
        )}

        <div className={styles.footer}>{FOOTER}</div>
      </div>

      {openSlug && (
        <div className={styles.overlay} onClick={close}>
          <div className={styles.panel} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className={styles.close} type="button" onClick={close}>× Fechar</button>
            {guideLoading || !guide ? (
              <div className={styles.state}>{guideLoading ? "Carregando…" : "Material não encontrado."}</div>
            ) : (
              <>
                <div className={styles.guideEyebrow}>✦ CÓDIGO ZERO · IA NA PRÁTICA</div>
                <h2 className={styles.guideTitle}>{guide.title}</h2>
                <div className={styles.guideRule} />
                <div className={styles.guideBody}>
                  <BlockList blocks={guide.blocks} />
                </div>
                <div className={styles.ctaCard}>
                  <div className={styles.ctaEyebrow}>Material parado não muda nada</div>
                  <h3 className={styles.ctaTitle}>Pegou o passo a passo. E agora?</h3>
                  <p className={styles.ctaDesc}>
                    Material salvo que você não executa não muda nada. No Código Zero eu mostro ao vivo como uso isso no trabalho real — e você executa comigo do lado.
                  </p>
                  <a className={styles.ctaBtn} href={guide.ctaUrl || DEFAULT_CTA_URL} target="_blank" rel="noopener noreferrer">
                    {guide.ctaText || DEFAULT_CTA_TEXT}
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
