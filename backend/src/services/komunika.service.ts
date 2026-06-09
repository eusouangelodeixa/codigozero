import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { sendPushToSuperAdmins } from '../routes/auth.routes';

/**
 * Komunika EMBEDDED MODULE integration (provision + SSO).
 *
 * Distinct from the funnel/remarketing WhatsApp integration (which uses
 * KOMUNIKA_ADMIN_API_KEY + the per-user komunikaApiKey/komunikaInstanceId
 * fields). This service provisions a Komunika tenant for a Código Zero user
 * who bought the Komunika add-on, keeps it in sync with their subscription,
 * deprovisions it when access lapses, and mints SSO magic-links.
 *
 * Server-to-server calls are authenticated with an HMAC-SHA256 signature over
 * the EXACT request bytes; the SSO link is a short-lived HS256 JWT. Both
 * secrets live only on the server and must match CODIGO_ZERO_HMAC_SECRET /
 * CODIGO_ZERO_JWT_SECRET on the Komunika side.
 */

const prisma = new PrismaClient();

// Exponential backoff for 5xx / network errors: 1s, 2s, 4s, 8s, 16s.
// One initial attempt + these 5 retries, then we give up and alert.
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

// Values accepted by the Komunika /deprovision endpoint.
export type KomunikaDeprovisionReason =
  | 'cancelled'
  | 'expired'
  | 'refunded'
  | 'fraud'
  | 'other';

/** Provision/update/deprovision require the HMAC secret + base URL. */
function isConfigured(): boolean {
  return !!(env.KOMUNIKA_HMAC_SECRET && env.KOMUNIKA_API_URL);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Unix seconds for the user's access expiry (REQUIRED by Komunika). */
function periodEnd(subscriptionEnd: Date | null): number {
  const endMs = subscriptionEnd ? subscriptionEnd.getTime() : Date.now() + 30 * 24 * 60 * 60 * 1000;
  return Math.floor(endMs / 1000);
}

async function alertFailure(path: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[KOMUNIKA] 🚨 ${path} failed after ${RETRY_DELAYS_MS.length} retries: ${msg}`);
  try {
    await sendPushToSuperAdmins({
      title: '🚨 Komunika indisponível',
      body: `Falha ao chamar ${path} após ${RETRY_DELAYS_MS.length + 1} tentativas. Verifique api.komunika.site.`,
      url: '/admin/status',
    });
  } catch {
    /* alerting must never throw */
  }
}

/**
 * Signed POST to Komunika with retry/backoff.
 *
 * The body is serialized ONCE and the signature is computed over those exact
 * bytes — never re-serialize after signing (key order matters). The timestamp
 * is re-stamped on every attempt so retries stay inside the ±5 min window.
 *
 * Retries on network errors and 5xx; 4xx (bad request / bad signature / not
 * found) are terminal and rethrown immediately. On final failure it alerts
 * the superadmins and throws.
 */
async function callKomunika(path: string, payload: unknown): Promise<any> {
  if (!isConfigured()) {
    throw new Error('KOMUNIKA_HMAC_SECRET / KOMUNIKA_API_URL not configured');
  }

  const body = JSON.stringify(payload); // sign EXACTLY these bytes
  let lastErr: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    const signature = crypto
      .createHmac('sha256', env.KOMUNIKA_HMAC_SECRET)
      .update(body)
      .digest('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();

    let res: Awaited<ReturnType<typeof fetch>>;
    try {
      res = await fetch(`${env.KOMUNIKA_API_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CZ-Signature': signature,
          'X-CZ-Timestamp': timestamp,
        },
        body,
        // Bound each attempt — undici's global fetch has no short default, so a
        // half-down host (connects then stalls) would otherwise hang. The
        // AbortError lands in the catch below and is retried as a network error.
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      // Network/timeout/abort error → retry.
      lastErr = e;
      console.warn(`[KOMUNIKA] ${path} attempt ${attempt + 1} network error: ${(e as Error)?.message}`);
      continue;
    }

    if (res.ok) {
      if (res.status === 204) return null;
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        // A 2xx with a malformed body is treated as retryable rather than
        // escaping the loop unalerted.
        lastErr = new Error(`Komunika ${path} → ${res.status}: malformed JSON body`);
        console.warn(`[KOMUNIKA] ${path} attempt ${attempt + 1} malformed body; will retry`);
        continue;
      }
    }

    const errText = await res.text().catch(() => '');
    if (res.status >= 500) {
      // Server error → retry.
      lastErr = new Error(`Komunika ${path} → ${res.status}: ${errText}`);
      console.warn(`[KOMUNIKA] ${path} attempt ${attempt + 1} failed (${res.status}); will retry`);
      continue;
    }

    // 4xx → terminal (don't retry a bad request / bad signature / 404).
    const termErr = new Error(`Komunika ${path} → ${res.status}: ${errText}`);
    // Auth/clock/contract failures (rotated secret, ±5min replay-window clock
    // skew, body-shape drift) are persistent and otherwise silent — alert once
    // so a broken integration is noticed. A 404 can be a benign already-gone
    // tenant on update/deprovision, so only log it.
    if ([400, 401, 403, 409].includes(res.status)) {
      console.error(`[KOMUNIKA] 🚨 ${path} terminal ${res.status} (auth/contract): ${errText}`);
      await alertFailure(path, termErr);
    } else {
      console.error(`[KOMUNIKA] ${path} terminal ${res.status}: ${errText}`);
    }
    throw termErr;
  }

  await alertFailure(path, lastErr);
  throw lastErr instanceof Error ? lastErr : new Error(`Komunika ${path} failed after retries`);
}

/** Stable per-subscription reference for Komunika audit logs. */
function externalId(user: { id: string; lojouOrderId: string | null; stripeSubscriptionId: string | null }): string {
  return user.lojouOrderId || user.stripeSubscriptionId || `cz_${user.id}`;
}

/**
 * POST /integrations/cz/provision — create (or reactivate) the tenant.
 * Idempotent: skips when the user already has an active tenant. Persists the
 * returned company/user ids and clears any prior deprovision stamp.
 */
export async function provisionKomunika(userId: string): Promise<void> {
  if (!isConfigured()) {
    console.warn('[KOMUNIKA] provision skipped — KOMUNIKA_HMAC_SECRET not configured');
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  // Already active → nothing to provision (renewals go through update).
  if (user.komunikaCompanyId && !user.komunikaDeprovisionedAt) return;

  const res = await callKomunika('/integrations/cz/provision', {
    cz_user_id: user.id,
    email: user.email,
    name: user.name,
    company_name: user.name,
    phone: user.phone,
    subscription: {
      external_id: externalId(user),
      status: 'active',
      current_period_end: periodEnd(user.subscriptionEnd),
    },
  });

  // A 201 must carry the company id per spec. A missing/empty/non-conforming
  // body would otherwise stamp a "provisioned but unlinked" row (komunikaActive
  // false forever, SSO 404). Surface it and bail instead of writing a bad state.
  if (!res?.komunika_company_id) {
    await alertFailure('/integrations/cz/provision', new Error('provision returned no komunika_company_id'));
    throw new Error('Komunika provision returned no komunika_company_id');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      komunikaCompanyId: res.komunika_company_id,
      komunikaUserId: res.komunika_user_id ?? user.komunikaUserId,
      komunikaProvisionedAt: new Date(),
      komunikaDeprovisionedAt: null,
    },
  });
  console.log(`[KOMUNIKA] ✅ Provisioned tenant for user=${user.id} (company=${res.komunika_company_id}, plan=${res.plan ?? 'n/a'})`);
}

/**
 * POST /integrations/cz/update-subscription — extend the access window / sync
 * status. No-op when the user was never provisioned.
 */
export async function updateKomunikaSubscription(
  userId: string,
  status: 'active' | 'past_due' | 'cancelled' = 'active',
): Promise<void> {
  if (!isConfigured()) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.komunikaCompanyId) return;

  await callKomunika('/integrations/cz/update-subscription', {
    cz_user_id: user.id,
    subscription: {
      external_id: externalId(user),
      status,
      current_period_end: periodEnd(user.subscriptionEnd),
    },
  });
  console.log(`[KOMUNIKA] 🔄 Subscription synced for user=${user.id} (status=${status})`);
}

/**
 * POST /integrations/cz/deprovision — block access. Idempotent: no-op when the
 * user was never provisioned or is already deprovisioned. Stamps
 * komunikaDeprovisionedAt so the SSO button hides and re-provision can detect
 * the lapsed state.
 */
export async function deprovisionKomunika(
  userId: string,
  reason: KomunikaDeprovisionReason = 'other',
): Promise<void> {
  if (!isConfigured()) return;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.komunikaCompanyId) return;
  if (user.komunikaDeprovisionedAt) return;

  await callKomunika('/integrations/cz/deprovision', {
    cz_user_id: user.id,
    reason,
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { komunikaDeprovisionedAt: new Date() },
  });
  console.log(`[KOMUNIKA] ⛔ Deprovisioned user=${user.id} (reason=${reason})`);
}

/**
 * Sync the module when a CZ order is approved. Komunika is bundled FREE with
 * the subscription, so EVERY paying member gets a tenant:
 *  - active tenant → renewal → update-subscription (extend period)
 *  - otherwise (never provisioned, or lapsed/deprovisioned) → provision
 *    (idempotent; reactivates an existing tenant with data intact)
 */
export async function syncKomunikaOnApprovedOrder(userId: string): Promise<void> {
  if (!isConfigured()) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { komunikaCompanyId: true, komunikaDeprovisionedAt: true },
  });
  if (!user) return;

  const activeTenant = !!user.komunikaCompanyId && !user.komunikaDeprovisionedAt;
  if (activeTenant) {
    await updateKomunikaSubscription(userId, 'active');
  } else {
    await provisionKomunika(userId);
  }
}

/**
 * Build the SSO magic-link URL. Server-side ONLY — the JWT secret must never
 * reach the browser. HS256, iss='codigo-zero', aud='komunika', exp = iat+600.
 */
export function buildKomunikaSsoUrl(
  user: { id: string; email: string; name: string },
  returnTo = '/dashboard',
): string {
  if (!env.KOMUNIKA_SSO_JWT_SECRET) {
    throw new Error('KOMUNIKA_SSO_JWT_SECRET not configured');
  }
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      iat: now,
      exp: now + 600, // 10 min — Komunika rejects longer
      iss: 'codigo-zero',
      aud: 'komunika',
    },
    env.KOMUNIKA_SSO_JWT_SECRET,
    { algorithm: 'HS256' },
  );
  const params = new URLSearchParams({ token, return_to: returnTo });
  return `${env.KOMUNIKA_API_URL}/auth/cz/callback?${params.toString()}`;
}
