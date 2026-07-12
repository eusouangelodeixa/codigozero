/**
 * Reusable e-mail sender (Resend — https://resend.com/docs).
 *
 * Hits the Resend REST API directly (no SDK) the same way `whatsapp.ts` hits
 * Komunika: best-effort, never throws, and silently no-ops when Resend isn't
 * configured. Reads the API key + `from` from SystemConfig (set in
 * /admin/config) with an env fallback — same pattern as the Komunika admin
 * credentials. The `from` domain must be verified in the Resend dashboard.
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

export interface EmailSendResult {
  ok: boolean;
  status: number | string;
  id?: string;
}

/**
 * Send an email through Resend's REST API. Returns a result the caller can
 * branch on; never throws.
 */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<EmailSendResult> {
  const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const apiKey = sysConfig?.resendApiKey || env.RESEND_API_KEY;
  const from = sysConfig?.resendFrom || env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn('[EMAIL] Resend not configured (resendApiKey / resendFrom) — skipping send');
    return { ok: false, status: 'resend-not-configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json().catch(() => null);
    if (res.ok) {
      const to = Array.isArray(opts.to) ? opts.to.join(',') : opts.to;
      console.log(`[EMAIL] ✅ Sent to ${to} (id=${data?.id ?? 'n/a'})`);
      return { ok: true, status: res.status, id: data?.id };
    }
    console.error(`[EMAIL] 🚨 Resend ${res.status}: ${JSON.stringify(data)?.slice(0, 240)}`);
    return { ok: false, status: res.status };
  } catch (e: any) {
    console.error('[EMAIL] send threw:', e?.message || e);
    return { ok: false, status: `throw:${e?.message || 'unknown'}` };
  }
}
