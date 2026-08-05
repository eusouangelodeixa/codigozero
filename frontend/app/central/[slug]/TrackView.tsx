"use client";
// Conta a visualização do material UMA vez por carga da página — só o browser
// real dispara (?track=1); crawlers que renderizam o HTML do servidor não
// executam este efeito, então o contador não infla com bots de preview.
import { useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function TrackView({ slug }: { slug: string }) {
  useEffect(() => {
    fetch(`${API}/api/content/resolve/${encodeURIComponent(slug)}?track=1`).catch(() => {});
  }, [slug]);
  return null;
}
