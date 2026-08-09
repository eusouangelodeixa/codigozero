/**
 * Rastreio de conversão da landing — pixel do navegador + espelho server-side.
 *
 * Cada evento é disparado DUAS vezes de propósito: no `fbq` do navegador e no
 * nosso backend (que reenvia pela Conversions API). Os dois levam o MESMO
 * `eventId`, então o Meta junta-os e conta uma vez só. A vantagem é que quando
 * o browser falha — bloqueador de anúncios, ITP do Safari, a pessoa fecha a
 * aba, ou o CTA navega para fora antes do request sair — o evento chega na
 * mesma pelo servidor.
 *
 * Nada aqui pode rebentar a página: tudo é try/catch e sem await no caminho do
 * utilizador.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Eventos padrão do Meta (vão por `track`); o resto vai por `trackCustom`. */
const STANDARD_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "Lead",
  "CompleteRegistration",
  "InitiateCheckout",
  "Contact",
  "Purchase",
  "Subscribe",
]);

export type TrackUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
};

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(^|;\\s*)" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : undefined;
}

/**
 * `_fbc` é o clique do anúncio. O pixel só o grava depois de carregar, e ele
 * carrega tarde (é injetado por JS depois de uma chamada à nossa API) — se a
 * pessoa converter antes disso, o clique perdia-se. Por isso montamo-lo nós a
 * partir do `fbclid` do URL, no formato que o Meta espera.
 */
function ensureFbc(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const existing = readCookie("_fbc");
  if (existing) return existing;

  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbclid) return undefined;

  const value = `fb.1.${Date.now()}.${fbclid}`;
  try {
    // 90 dias é a janela de atribuição de clique do Meta.
    document.cookie = `_fbc=${encodeURIComponent(value)}; path=/; max-age=${90 * 24 * 60 * 60}; SameSite=Lax`;
  } catch {
    /* cookies bloqueados — seguimos com o valor em memória */
  }
  return value;
}

/**
 * Identificadores de atribuição para mandar ao backend junto do evento.
 *
 * Além dos cookies do Meta, levamos os UTM da visita: eles respondem a pergunta
 * que o Gerenciador de Eventos responde mal — QUAL anúncio gerou esta venda em
 * concreto — e ficam no nosso banco, independentes da plataforma.
 */
export function getAttribution(): Record<string, string | undefined> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const utm = (key: string) => params.get(key)?.slice(0, 200) || undefined;
  return {
    fbp: readCookie("_fbp"),
    fbc: ensureFbc(),
    landingUrl: window.location.href,
    utmSource: utm("utm_source"),
    utmMedium: utm("utm_medium"),
    utmCampaign: utm("utm_campaign"),
    utmContent: utm("utm_content"),
    utmTerm: utm("utm_term"),
  };
}

function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ambientes antigos caem no fallback */
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Dispara um evento nos dois canais.
 *
 * `keepalive: true` (e `sendBeacon` quando disponível) é o que faz o evento do
 * CTA sobreviver: o clique dentro do VSL navega a página para o checkout no
 * mesmo instante, e um fetch normal seria cancelado a meio.
 */
export function track(
  eventName: string,
  customData: Record<string, unknown> = {},
  userData: TrackUserData = {},
): string {
  const eventId = newEventId();
  if (typeof window === "undefined") return eventId;

  // 1) Pixel do navegador
  try {
    const fbq = (window as any).fbq;
    if (typeof fbq === "function") {
      const method = STANDARD_EVENTS.has(eventName) ? "track" : "trackCustom";
      fbq(method, eventName, customData, { eventID: eventId });
    }
  } catch {
    /* pixel bloqueado — o servidor trata do assunto */
  }

  // 2) Espelho server-side (Conversions API)
  try {
    const attribution = getAttribution();
    const body = JSON.stringify({
      eventName,
      eventId,
      sourceUrl: attribution.landingUrl,
      fbp: attribution.fbp,
      fbc: attribution.fbc,
      email: userData.email || undefined,
      phone: userData.phone || undefined,
      firstName: userData.firstName || undefined,
      lastName: userData.lastName || undefined,
      externalId: userData.externalId || undefined,
      customData,
    });

    const url = `${API_URL}/api/track`;
    const beacon = navigator.sendBeacon?.bind(navigator);
    if (beacon) {
      beacon(url, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* nunca deixar o rastreio partir a página */
  }

  return eventId;
}

/** Dispara uma só vez por carregamento (evita duplicar em re-render). */
const fired = new Set<string>();
export function trackOnce(
  key: string,
  eventName: string,
  customData: Record<string, unknown> = {},
  userData: TrackUserData = {},
): void {
  if (fired.has(key)) return;
  fired.add(key);
  track(eventName, customData, userData);
}

/**
 * Liga-se ao player da Kilax (o VSL) e traduz o que ele emite em eventos.
 *
 * A Kilax republica tudo o que o player manda como `postMessage` com
 * `source: 'kilax-player'`. Ouvimos a mensagem crua em vez de usar só
 * `KilaxEmbed.on(...)` porque assim apanhamos também eventos que eles venham a
 * acrescentar, sem termos de saber os nomes de antemão.
 *
 * O caso que interessa mais é o `open_url`: é o CTA DENTRO do vídeo. A Kilax
 * responde-lhe com `window.location.href = url`, ou seja, a página sai no
 * mesmo instante — daí o envio por beacon.
 *
 * Devolve a função de limpeza.
 */
export function attachVslTracking(): () => void {
  if (typeof window === "undefined") return () => {};

  const seenProgress = new Set<number>();

  const onMessage = (e: MessageEvent) => {
    const data = e?.data;
    if (!data || data.source !== "kilax-player" || !data.event) return;

    switch (data.event) {
      case "play":
        trackOnce("vsl_play", "VideoPlay", { content_name: "vsl", source: "kilax" });
        break;

      case "progress":
      case "timeupdate": {
        // Marcos de retenção: dizem onde o VSL perde a audiência e servem para
        // públicos de remarketing ("viu 50% e não comprou").
        const percent = Number(data.percent ?? data.progress ?? 0);
        for (const milestone of [25, 50, 75, 95]) {
          if (percent >= milestone && !seenProgress.has(milestone)) {
            seenProgress.add(milestone);
            track("VideoProgress", { content_name: "vsl", percent: milestone });
          }
        }
        break;
      }

      case "ended":
        trackOnce("vsl_ended", "VideoProgress", { content_name: "vsl", percent: 100 });
        break;

      case "open_url":
        // O CTA do vídeo. A página está a navegar AGORA.
        track("InitiateCheckout", {
          content_name: "vsl_cta",
          source: "kilax",
          currency: "MZN",
        });
        break;
    }
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
