/**
 * Provedor de WhatsApp OFICIAL via Twilio (API Business).
 *
 * É o canal PRIMÁRIO quando ativado; o Komunika (lib/whatsapp.ts) fica de
 * reserva. Config vem do SystemConfig (singleton) com fallback de env — mesmo
 * padrão do Komunika/Resend, então dá pra ligar pelo /admin/config sem deploy.
 *
 * REGRA DA META: mensagem iniciada pela empresa (fora da janela de 24h) TEM de
 * usar um TEMPLATE aprovado. Por isso enviamos com `ContentSid` (o template) +
 * `ContentVariables` (JSON {"1":"…","2":"…"}). Texto livre (`Body`) só valeria
 * dentro da janela de atendimento — não é o nosso caso. Sem um Content SID para
 * o tipo, o chamador nem tenta o Twilio (cai no Komunika).
 *
 * Nunca lança: devolve {ok,status} para o chamador decidir o fallback.
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

export type TwilioTemplateType = 'credentials' | 'otp' | 'save_contact' | 'expiration' | 'broadcast';

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from?: string; // "whatsapp:+258…"
  messagingServiceSid?: string;
  templateSids: Record<string, string>;
}

/** Config resolvida (SystemConfig → env). null = Twilio não configurado/desligado. */
export async function getTwilioConfig(): Promise<TwilioConfig | null> {
  const cfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  if (!cfg?.twilioEnabled) return null;
  const accountSid = cfg.twilioAccountSid || env.TWILIO_ACCOUNT_SID;
  const authToken = cfg.twilioAuthToken || env.TWILIO_AUTH_TOKEN;
  const from = cfg.twilioWhatsappFrom || env.TWILIO_WHATSAPP_FROM || undefined;
  const messagingServiceSid = cfg.twilioMessagingServiceSid || env.TWILIO_MESSAGING_SERVICE_SID || undefined;
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) return null;
  const templateSids = (cfg.twilioTemplateSids as Record<string, string>) || {};
  return { accountSid, authToken, from, messagingServiceSid, templateSids };
}

/** Content SID do tipo, se configurado. */
export function templateSidFor(config: TwilioConfig, type: TwilioTemplateType): string | null {
  const sid = config.templateSids?.[type];
  return typeof sid === 'string' && sid.trim() ? sid.trim() : null;
}

/** Formata o destino para o WhatsApp do Twilio: "whatsapp:+<E.164>". `digits`
 *  é o número já normalizado (só dígitos, com DDI). */
function toWhatsappAddress(digits: string): string {
  return `whatsapp:+${digits}`;
}

/**
 * Envia uma mensagem de template do WhatsApp via Twilio.
 * @param toDigits número em dígitos com DDI (ex.: 258841234567), sem "+".
 */
export async function sendTwilioWhatsAppTemplate(opts: {
  config: TwilioConfig;
  toDigits: string;
  contentSid: string;
  variables?: Record<string, string>;
  retries?: number;
}): Promise<{ ok: boolean; status: number | string }> {
  const { config, toDigits, contentSid } = opts;
  const retries = opts.retries ?? 2;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

  const params = new URLSearchParams();
  params.set('To', toWhatsappAddress(toDigits));
  if (config.messagingServiceSid) params.set('MessagingServiceSid', config.messagingServiceSid);
  else if (config.from) params.set('From', config.from.startsWith('whatsapp:') ? config.from : `whatsapp:${config.from}`);
  params.set('ContentSid', contentSid);
  if (opts.variables && Object.keys(opts.variables).length) {
    params.set('ContentVariables', JSON.stringify(opts.variables));
  }

  let lastStatus: number | string = 'no-attempt';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: AbortSignal.timeout(15000),
      });
      lastStatus = r.status;
      if (r.ok) return { ok: true, status: r.status };
      const body = await r.text().catch(() => '');
      console.warn(`[TWILIO] attempt ${attempt} failed: ${r.status} ${body.slice(0, 200)}`);
      // 4xx (a não ser 429) = erro permanente (config/template/número) → não re-tenta.
      if (r.status >= 400 && r.status < 500 && r.status !== 429) break;
    } catch (e: any) {
      lastStatus = `throw:${e?.message || 'unknown'}`;
      console.warn(`[TWILIO] attempt ${attempt} threw:`, e?.message || e);
    }
    if (attempt < retries) await new Promise((res) => setTimeout(res, 1200 * attempt));
  }
  console.error(`[TWILIO] 🚨 WhatsApp falhou (lastStatus=${lastStatus}) — caindo pro fallback`);
  return { ok: false, status: lastStatus };
}
