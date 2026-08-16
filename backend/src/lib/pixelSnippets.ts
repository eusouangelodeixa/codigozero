/**
 * Gera os snippets de rastreio a partir de IDs validados — NUNCA a partir de
 * HTML fornecido pelo coprodutor. Isto fecha o XSS armazenado: um coprodutor
 * (parceiro semi-confiável) só informa o ID do pixel; o HTML sai daqui, de um
 * template fixo, então não há como injetar `<script>` arbitrário que rode no
 * navegador do comprador.
 */

/** Só formatos plausíveis de ID — dígitos/hífen/sublinhado, curtos. */
const META_RE = /^[0-9]{6,20}$/;
const GA4_RE = /^G-[A-Z0-9]{6,12}$/;
const TIKTOK_RE = /^[A-Z0-9]{10,30}$/;

export function sanitizeMetaPixelId(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return META_RE.test(s) ? s : null;
}
export function sanitizeGa4Id(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return GA4_RE.test(s) ? s : null;
}
export function sanitizeTiktokPixelId(v: unknown): string | null {
  const s = String(v ?? '').trim().toUpperCase();
  return TIKTOK_RE.test(s) ? s : null;
}

/** Monta o HTML dos pixels a partir dos IDs já validados (ou vazios). */
export function buildPixelHtml(ids: {
  metaPixelId?: string | null;
  ga4Id?: string | null;
  tiktokPixelId?: string | null;
}): string {
  const parts: string[] = [];

  if (ids.metaPixelId && META_RE.test(ids.metaPixelId)) {
    const id = ids.metaPixelId;
    parts.push(
      `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');</script>`,
    );
  }
  if (ids.ga4Id && GA4_RE.test(ids.ga4Id)) {
    const id = ids.ga4Id;
    parts.push(
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');</script>`,
    );
  }
  if (ids.tiktokPixelId && TIKTOK_RE.test(ids.tiktokPixelId)) {
    const id = ids.tiktokPixelId;
    parts.push(
      `<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e){var n="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=n;ttq._t=ttq._t||{};ttq._t[e]=+new Date;var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=n+"?sdkid="+e;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${id}');ttq.page()}(window,document,'ttq');</script>`,
    );
  }
  return parts.join('\n');
}
