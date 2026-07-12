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
 * Send a plain-text WhatsApp message through the Komunika admin instance.
 * Retries up to `retries` times with linear backoff. Never throws — returns
 * a result the caller can branch on.
 */
export async function sendWhatsAppMessage(opts: {
  phone: string;
  content: string;
  retries?: number;
  /** When true, run the MZ normalization on `phone`. Default true. */
  normalize?: boolean;
}): Promise<WhatsAppSendResult> {
  const retries = opts.retries ?? 3;
  const phone = opts.normalize === false ? opts.phone : normalizeMzPhone(opts.phone);

  if (!phone) return { ok: false, status: 'invalid-phone' };

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
