/**
 * Reusable e-mail sender (Resend — https://resend.com/docs).
 *
 * Hits the Resend REST API directly (no SDK) the same way `whatsapp.ts` hits
 * Komunika: best-effort, never throws, and silently no-ops when Resend isn't
 * configured. Sending requires RESEND_API_KEY and a RESEND_FROM address whose
 * domain is verified in the Resend dashboard.
 */
import { env } from '../config/env';

export interface EmailSendResult {
  ok: boolean;
  status: number | string;
  id?: string;
}

/** Resend is usable only when both the API key and a `from` address are set. */
export function isEmailConfigured(): boolean {
  return !!env.RESEND_API_KEY && !!env.RESEND_FROM;
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
  if (!isEmailConfigured()) {
    console.warn('[EMAIL] Resend not configured (RESEND_API_KEY / RESEND_FROM) — skipping send');
    return { ok: false, status: 'resend-not-configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM,
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
