import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * Meta Conversions API (CAPI) — envio de eventos server-side.
 *
 * Porque isto existe: o pixel do navegador perde uma fatia enorme do tráfego
 * pago (bloqueadores, ITP do Safari/iOS, utilizador que fecha antes do request
 * sair). O CAPI manda o mesmo evento a partir do servidor, e o Meta junta os
 * dois pelo `event_id` — o evento conta UMA vez, mas sobrevive mesmo quando o
 * browser falha. Para a `Purchase` isto é ainda mais crítico: ela acontece num
 * webhook, sem browser nenhum do outro lado.
 *
 * A deduplicação depende de mandar o MESMO `event_id` (e o mesmo `event_name`)
 * nos dois lados. Quem gera o id é o navegador; o backend só o repete.
 */

const GRAPH_VERSION = 'v21.0';

export type MetaUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  /** Cookies do pixel — sem eles a atribuição do CAPI cai muito. */
  fbp?: string | null;
  fbc?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  country?: string | null;
};

export type MetaEvent = {
  eventName: string;
  eventId: string;
  eventTime?: number;
  eventSourceUrl?: string | null;
  actionSource?: 'website' | 'system_generated' | 'other';
  userData?: MetaUserData;
  customData?: Record<string, unknown>;
};

/** SHA-256 em hex, como o Meta exige para os campos de correspondência. */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Normaliza antes de hashear — o Meta compara hashes, então "Ana@Mail.com " e
 * "ana@mail.com" só batem se normalizarmos igual do lado deles.
 */
function hashEmail(email?: string | null): string | undefined {
  const clean = (email || '').trim().toLowerCase();
  return clean.includes('@') ? sha256(clean) : undefined;
}

/** Telefone: só dígitos, com indicativo. 84xxxxxxx (MZ) vira 25884xxxxxxx. */
function hashPhone(phone?: string | null): string | undefined {
  let digits = (phone || '').replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 9 && digits.startsWith('8')) digits = `258${digits}`;
  return digits.length >= 8 ? sha256(digits) : undefined;
}

function hashName(name?: string | null): string | undefined {
  const clean = (name || '').trim().toLowerCase();
  return clean ? sha256(clean) : undefined;
}

function buildUserData(u: MetaUserData = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const em = hashEmail(u.email);
  const ph = hashPhone(u.phone);
  const fn = hashName(u.firstName);
  const ln = hashName(u.lastName);

  // Os campos hasheados vão em array, conforme o contrato do CAPI.
  if (em) out.em = [em];
  if (ph) out.ph = [ph];
  if (fn) out.fn = [fn];
  if (ln) out.ln = [ln];
  if (u.externalId) out.external_id = [sha256(String(u.externalId))];
  if (u.country) out.country = [sha256(u.country.trim().toLowerCase())];

  // Estes NÃO são hasheados — o Meta espera-os em claro.
  if (u.fbp) out.fbp = u.fbp;
  if (u.fbc) out.fbc = u.fbc;
  if (u.ip) out.client_ip_address = u.ip;
  if (u.userAgent) out.client_user_agent = u.userAgent;

  return out;
}

type MetaConfig = { pixelId: string; token: string; testEventCode?: string | null };

let cache: { value: MetaConfig | null; expiresAt: number } = { value: null, expiresAt: 0 };

/**
 * Config vive no SystemConfig (editável em /admin/config, sem deploy), com
 * fallback para env. Cache curto para não bater no banco a cada evento.
 */
export async function getMetaConfig(): Promise<MetaConfig | null> {
  if (Date.now() < cache.expiresAt) return cache.value;

  let value: MetaConfig | null = null;
  try {
    const cfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const pixelId = cfg?.metaPixelId || process.env.META_PIXEL_ID || '';
    const token = cfg?.metaCapiToken || process.env.META_CAPI_TOKEN || '';
    if (pixelId && token) {
      value = { pixelId, token, testEventCode: cfg?.metaTestEventCode || null };
    }
  } catch (err: any) {
    console.error('[META] falha a ler config:', err?.message || err);
  }

  cache = { value, expiresAt: Date.now() + 60_000 };
  return value;
}

/** Limpa o cache — usado quando o admin grava a config. */
export function invalidateMetaConfigCache(): void {
  cache = { value: null, expiresAt: 0 };
}

/**
 * Envia um evento para o CAPI. NUNCA lança: rastreio não pode derrubar uma
 * venda nem um webhook. Devolve `{ ok }` para quem quiser registar.
 */
export async function sendMetaEvent(event: MetaEvent): Promise<{ ok: boolean; status?: number }> {
  const config = await getMetaConfig();
  if (!config) return { ok: false, status: 0 };

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        action_source: event.actionSource || 'website',
        ...(event.eventSourceUrl ? { event_source_url: event.eventSourceUrl } : {}),
        user_data: buildUserData(event.userData),
        ...(event.customData && Object.keys(event.customData).length
          ? { custom_data: event.customData }
          : {}),
      },
    ],
    access_token: config.token,
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      console.error(`[META] ${event.eventName} recusado (${res.status}): ${body.slice(0, 300)}`);
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err: any) {
    console.error(`[META] ${event.eventName} falhou: ${err?.message || err}`);
    return { ok: false };
  }
}

/**
 * Evento de compra a partir de um webhook (Lojou/Stripe). Não há browser aqui,
 * por isso a atribuição depende do `fbp`/`fbc` guardados quando o lead entrou —
 * e do `external_id`, que liga a compra ao mesmo utilizador visto na landing.
 */
export async function sendPurchaseEvent(args: {
  userId: string;
  orderId: string;
  amount: number;
  currency?: string;
  isRenewal?: boolean;
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: {
        id: true, name: true, email: true, phone: true,
        fbp: true, fbc: true, landingUrl: true,
      },
    });
    if (!user) return;

    const [firstName, ...rest] = (user.name || '').trim().split(' ');
    // `event_id` determinístico: se o webhook for reprocessado (a Lojou reenvia
    // em falha), o Meta vê o mesmo id e não conta a venda duas vezes.
    const eventId = `purchase_${args.orderId}`;

    await sendMetaEvent({
      eventName: args.isRenewal ? 'Subscribe' : 'Purchase',
      eventId,
      actionSource: 'system_generated',
      eventSourceUrl: user.landingUrl || undefined,
      userData: {
        email: user.email,
        phone: user.phone,
        firstName,
        lastName: rest.join(' ') || null,
        externalId: user.id,
        fbp: user.fbp,
        fbc: user.fbc,
      },
      customData: {
        value: args.amount,
        currency: args.currency || 'MZN',
        content_name: 'Código Zero',
        content_type: 'product',
        order_id: args.orderId,
      },
    });
  } catch (err: any) {
    console.error('[META] purchase event falhou:', err?.message || err);
  }
}
