/**
 * Guardas de tipo para upload. SVG é imagem, mas pode carregar JavaScript
 * (<script>, on*=) — servido inline do nosso domínio, executa. Bloqueamos SVG
 * em todo upload e exigimos um tipo de imagem raster conhecido.
 */
const SAFE_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif']);

export function isSafeImageMime(mime: string): boolean {
  return SAFE_IMAGE.has((mime || '').toLowerCase());
}

/** true para imagem raster segura OU um dos tipos extra permitidos (ex.: pdf, audio/*). */
export function isAllowedUpload(mime: string, extra?: { pdf?: boolean; audio?: boolean; video?: boolean }): boolean {
  const m = (mime || '').toLowerCase();
  if (isSafeImageMime(m)) return true;
  if (extra?.pdf && m === 'application/pdf') return true;
  if (extra?.audio && m.startsWith('audio/')) return true;
  if (extra?.video && m.startsWith('video/')) return true;
  return false;
}
