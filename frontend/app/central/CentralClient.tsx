"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./central.module.css";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Header/footer identity — kept here (not admin-editable) since the hub is a
// single page. Matches the LP funnel voice.
const EYEBROW = "✦ CÓDIGO ZERO · @eusouangelodeixa";
const TITLE_PRE = "CENTRAL DE";
const TITLE_HL = "MATERIAL";
const SUBTITLE = "Todo o material prático de IA e Claude Code que apareço usando nos reels, num lugar só. Escolhe e resgata o passo a passo.";
const SEARCH_PLACEHOLDER = "Comentou uma palavra? Busca aqui";
const FOOTER = "Código Zero · IA · Claude Code na prática · @eusouangelodeixa";

type CardItem = {
  slug: string; title: string; theme: string | null;
  ogImageUrl: string | null; metaDescription: string | null;
  createdAt: string;
};

// hrefBase vem do server (host-aware): "/" na origem central.czero.sbs (URL
// limpa central.czero.sbs/{slug}) e "/central/" quando o hub roda no host do
// app. Cada card é um LINK de verdade — página própria, sem modal.
export default function CentralClient({ hrefBase }: { hrefBase: string }) {
  const [pages, setPages] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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
              <a key={p.slug} className={styles.card} href={`${hrefBase}${encodeURIComponent(p.slug)}`} aria-label={p.title}>
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
              </a>
            ))}
          </div>
        )}

        <div className={styles.footer}>{FOOTER}</div>
      </div>
    </div>
  );
}
