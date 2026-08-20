/**
 * Reusable WhatsApp sender (Komunika).
 *
 * Extracted from payment.service.ts:sendCredentialsViaWhatsApp so the same
 * battle-tested delivery loop (admin instance + 3 retries) can back every
 * outbound message: welcome credentials, OTP codes, PWA-install reminders,
 * expiration alerts, etc.
 *
 * Reads the Komunika admin credentials from SystemConfig (singleton) with an
 * env fallback — the same source the rest of the backend uses.
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { getTwilioConfig, templateSidFor, sendTwilioWhatsAppTemplate, type TwilioTemplateType } from './twilio';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

export interface WhatsAppSendResult {
  ok: boolean;
  status: number | string;
}

/**
 * Normalize a phone into the numeric E.164 string Komunika expects (no `+`).
 * Mozambican mobiles are 9 digits starting with 8 — prefix the 258 country
 * code when missing. Numbers that already carry a country code (>= 11 digits)
 * are left untouched so international (Stripe) customers still work.
 */
export function normalizeMzPhone(raw: string): string {
  let phone = (raw || '').replace(/\D/g, '');
  if (phone.length === 9 && phone.startsWith('8')) phone = `258${phone}`;
  return phone;
}

/**
 * Envia uma mensagem de WhatsApp.
 *
 * CANAL: Twilio oficial PRIMEIRO (quando ativado E houver um template para
 * `template.type`), com fallback automático para o Komunika usando o `content`
 * de texto livre. Sem `template`, ou com Twilio desligado, vai direto pro
 * Komunika — comportamento histórico, zero regressão.
 *
 * Por que os dois: o WhatsApp oficial só entrega mensagem iniciada pela empresa
 * via TEMPLATE aprovado; então cada tipo migra para o Twilio assim que o seu
 * Content SID for cadastrado no /admin/config. Enquanto não for, segue no
 * Komunika. O `content` é sempre necessário (é o corpo do fallback).
 *
 * Nunca lança — devolve {ok,status} para o chamador ramificar.
 */
export async function sendWhatsAppMessage(opts: {
  phone: string;
  content: string;
  retries?: number;
  /** When true, run the MZ normalization on `phone`. Default true. */
  normalize?: boolean;
  /** Descreve o template do Twilio para este envio. Sem isto (ou Twilio off),
   *  usa o Komunika com `content`. `variables` = {"1":"…","2":"…"} do template. */
  template?: { type: TwilioTemplateType; variables?: Record<string, string> };
}): Promise<WhatsAppSendResult> {
  const retries = opts.retries ?? 3;
  const phone = opts.normalize === false ? opts.phone : normalizeMzPhone(opts.phone);

  if (!phone) return { ok: false, status: 'invalid-phone' };

  // ── Canal primário: Twilio oficial (se ativado e com template do tipo) ──
  if (opts.template) {
    try {
      const tw = await getTwilioConfig();
      const sid = tw ? templateSidFor(tw, opts.template.type) : null;
      if (tw && sid) {
        const r = await sendTwilioWhatsAppTemplate({
          config: tw,
          toDigits: phone,
          contentSid: sid,
          variables: opts.template.variables,
        });
        if (r.ok) return { ok: true, status: r.status };
        console.warn(`[WHATSAPP] Twilio falhou (${r.status}) — fallback Komunika`);
      }
    } catch (e: any) {
      console.warn('[WHATSAPP] Twilio erro inesperado — fallback Komunika:', e?.message || e);
    }
  }

  const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const apiKey = sysConfig?.komunikaAdminApiKey || env.KOMUNIKA_ADMIN_API_KEY;
  const instanceId = sysConfig?.komunikaInstanceId;
  if (!apiKey || !instanceId) {
    console.warn('[WHATSAPP] Komunika not configured — skipping send');
    return { ok: false, status: 'komunika-not-configured' };
  }

  const url = (env.KOMUNIKA_API_URL || 'https://api.komunika.site') + '/api/v1/messages/send';
  let lastStatus: number | string = 'no-attempt';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ instanceId, to: phone, type: 'text', content: opts.content }),
      });
      lastStatus = r.status;
      if (r.ok) return { ok: true, status: r.status };
      const body = await r.text().catch(() => '');
      console.warn(`[WHATSAPP] attempt ${attempt} failed: ${r.status} ${body.slice(0, 160)}`);
    } catch (e: any) {
      lastStatus = `throw:${e?.message || 'unknown'}`;
      console.warn(`[WHATSAPP] attempt ${attempt} threw:`, e?.message || e);
    }
    if (attempt < retries) await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
  console.error(`[WHATSAPP] 🚨 Failed after ${retries} attempts (lastStatus=${lastStatus})`);
  return { ok: false, status: lastStatus };
}

export interface WhatsAppPollResult extends WhatsAppSendResult {
  /** WhatsApp message id of the poll (Evolution's data.key.id) — the key that
   *  correlates poll.vote webhook events back to this poll. */
  messageId?: string;
}

/**
 * Send a native WhatsApp poll (sondagem) through the Komunika admin instance.
 * Same delivery contract as sendWhatsAppMessage (SystemConfig creds, retries,
 * never throws), but POSTs /messages/send-poll and extracts the poll message
 * id from Komunika's raw Evolution response (`data.key.id`).
 *
 * A 2xx WITHOUT a message id counts as a FAILURE: without the id the vote can
 * never be correlated, so it's better to retry than to send an orphan poll.
 */
export async function sendWhatsAppPoll(opts: {
  phone: string;
  question: string;
  options: string[];
  retries?: number;
  normalize?: boolean;
}): Promise<WhatsAppPollResult> {
  const retries = opts.retries ?? 3;
  const phone = opts.normalize === false ? opts.phone : normalizeMzPhone(opts.phone);

  if (!phone) return { ok: false, status: 'invalid-phone' };

  const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const apiKey = sysConfig?.komunikaAdminApiKey || env.KOMUNIKA_ADMIN_API_KEY;
  const instanceId = sysConfig?.komunikaInstanceId;
  if (!apiKey || !instanceId) {
    console.warn('[WHATSAPP] Komunika not configured — skipping poll send');
    return { ok: false, status: 'komunika-not-configured' };
  }

  const url = (env.KOMUNIKA_API_URL || 'https://api.komunika.site') + '/api/v1/messages/send-poll';
  let lastStatus: number | string = 'no-attempt';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({
          instanceId,
          to: phone,
          question: opts.question,
          options: opts.options,
          multiSelect: false,
        }),
      });
      lastStatus = r.status;
      if (r.ok) {
        const json: any = await r.json().catch(() => null);
        const messageId = json?.data?.key?.id;
        if (messageId) return { ok: true, status: r.status, messageId };
        lastStatus = 'no-message-id';
        console.warn(`[WHATSAPP] poll attempt ${attempt}: 2xx but no data.key.id in response`);
      } else {
        const body = await r.text().catch(() => '');
        console.warn(`[WHATSAPP] poll attempt ${attempt} failed: ${r.status} ${body.slice(0, 160)}`);
      }
    } catch (e: any) {
      lastStatus = `throw:${e?.message || 'unknown'}`;
      console.warn(`[WHATSAPP] poll attempt ${attempt} threw:`, e?.message || e);
    }
    if (attempt < retries) await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
  console.error(`[WHATSAPP] 🚨 Poll failed after ${retries} attempts (lastStatus=${lastStatus})`);
  return { ok: false, status: lastStatus };
}

/**
 * Cheap Komunika availability probe (same endpoint the 6h health-check cron
 * hits). Used by the feedback sender to decide the channel: unhealthy →
 * fall back to the e-mailed web survey link instead of WhatsApp polls.
 */
export async function komunikaIsHealthy(): Promise<boolean> {
  try {
    const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
    const apiKey = sysConfig?.komunikaAdminApiKey || env.KOMUNIKA_ADMIN_API_KEY;
    if (!apiKey || !sysConfig?.komunikaInstanceId) return false;
    const apiUrl = env.KOMUNIKA_API_URL || 'https://api.komunika.site';
    const r = await fetch(`${apiUrl}/api/v1/sdr-bot/assistants`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(15000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
