/**
 * Links de checkout da Lojou — um sítio só para os construir.
 *
 * A Lojou serve três tipos de link, e a diferença importa:
 *  - `pay.lojou.app/{pid}`      → checkout público do produto, PERMANENTE.
 *  - `pay.lojou.app/p/{pid}`    → o MESMO checkout, formato antigo. Continua a
 *    funcionar (a app deles ainda regista a rota), mas deixou de ser a forma
 *    canónica em 2026-08.
 *  - `pay.lojou.app/token/{id}` → link por encomenda, EXPIRA em ~4h.
 *
 * Por isso tudo o que é assíncrono (lembretes de expiração, remarketing,
 * renovação, cupões) tem de usar o link permanente: um `/token/` já está morto
 * quando a pessoa toca na mensagem horas depois.
 */

const CHECKOUT_HOST = 'https://pay.lojou.app';

/**
 * Monta o link público (permanente) do checkout de um produto.
 * Parâmetros vazios/nulos são ignorados, para não gerar `?name=&email=`.
 */
export function lojouCheckoutUrl(
  pid: string,
  params?: Record<string, string | null | undefined>,
): string {
  const url = new URL(`${CHECKOUT_HOST}/${encodeURIComponent(pid)}`);
  for (const [key, value] of Object.entries(params || {})) {
    if (value) url.searchParams.append(key, value);
  }
  return url.toString();
}

/**
 * Um link de checkout serve para uso assíncrono quando NÃO é do tipo `/token/`.
 *
 * Antes isto era testado com `url.includes('/p/')`, o que passou a rejeitar os
 * links novos (curtos) — que são exactamente os permanentes que queremos
 * reaproveitar. A pergunta certa é sempre "isto expira?", não "tem /p/?".
 */
export function isPermanentCheckoutUrl(url?: string | null): boolean {
  return !!url && url.includes('pay.lojou.app') && !url.includes('/token/');
}

/**
 * Normaliza um link guardado (env, base de dados, campo preenchido no admin)
 * para a forma curta actual. Mantém query string e deixa passar intacto o que
 * não for um checkout `/p/` da Lojou.
 */
export function normalizeLojouCheckoutUrl(url?: string | null): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('pay.lojou.app')) return url;
    const match = parsed.pathname.match(/^\/p\/([^/]+)\/?$/);
    if (!match) return url;
    parsed.pathname = `/${match[1]}`;
    return parsed.toString();
  } catch {
    return url;
  }
}
