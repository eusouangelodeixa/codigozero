import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let initialized = false;
let initError: string | null = null;

function ensureInit() {
  if (initialized || initError) return;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@czero.sbs';
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';
  const privateKey = process.env.VAPID_PRIVATE_KEY || '';
  if (!publicKey || !privateKey) {
    initError = `Missing VAPID keys (public=${publicKey.length}, private=${privateKey.length})`;
    console.error('[PUSH] ❌', initError);
    return;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    initialized = true;
    console.log(`[PUSH] ✅ VAPID initialized (subject=${subject}, pub=${publicKey.length}ch)`);
  } catch (e: any) {
    initError = e?.message ?? String(e);
    console.error('[PUSH] ❌ VAPID setup failed:', initError);
  }
}

ensureInit();

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export interface PushResult {
  attempted: number;
  delivered: number;
  removed: number;
  failed: number;
  errors: string[];
}

interface SubLike {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

async function sendToSubscriptions(
  subs: SubLike[],
  payload: PushPayload,
  label: string,
): Promise<PushResult> {
  ensureInit();
  const result: PushResult = { attempted: subs.length, delivered: 0, removed: 0, failed: 0, errors: [] };
  if (initError) {
    result.failed = subs.length;
    result.errors.push(initError);
    console.error(`[PUSH] ${label}: skipped — ${initError}`);
    return result;
  }
  if (subs.length === 0) {
    console.log(`[PUSH] ${label}: no subscriptions`);
    return result;
  }

  const body = JSON.stringify(payload);
  const settled = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      ),
    ),
  );

  const deadIds: string[] = [];
  settled.forEach((r, i) => {
    const sub = subs[i];
    if (r.status === 'fulfilled') {
      result.delivered++;
      return;
    }
    const err = r.reason as { statusCode?: number; body?: string; message?: string };
    const code = err?.statusCode;
    if (code === 410 || code === 404) {
      deadIds.push(sub.id);
      result.removed++;
      return;
    }
    result.failed++;
    const host = (() => {
      try { return new URL(sub.endpoint).host; } catch { return 'unknown-host'; }
    })();
    result.errors.push(`[${code ?? 'NETERR'} @ ${host}] ${err?.message ?? err?.body ?? 'unknown'}`);
  });

  if (deadIds.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { id: { in: deadIds } } })
      .catch((e) => console.error('[PUSH] Cleanup error:', e));
  }

  console.log(
    `[PUSH] ${label}: attempted=${result.attempted} delivered=${result.delivered} removed=${result.removed} failed=${result.failed}`,
  );
  if (result.errors.length > 0) {
    console.error(`[PUSH] ${label} errors:`, result.errors.slice(0, 5).join(' | '));
  }
  return result;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<PushResult> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  return sendToSubscriptions(subs, payload, `user:${userId.slice(0, 8)}`);
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<PushResult> {
  if (userIds.length === 0) {
    return { attempted: 0, delivered: 0, removed: 0, failed: 0, errors: [] };
  }
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  return sendToSubscriptions(subs, payload, `users:${userIds.length}`);
}

export async function sendPushBroadcast(payload: PushPayload): Promise<PushResult> {
  const subs = await prisma.pushSubscription.findMany();
  return sendToSubscriptions(subs, payload, 'broadcast');
}

export async function sendPushToSuperAdmins(payload: PushPayload): Promise<PushResult> {
  const admins = await prisma.user.findMany({
    where: { role: 'superadmin' },
    select: { id: true },
  });
  const result = await sendPushToUsers(admins.map((a) => a.id), payload);

  // Pushcut iPhone integration (separate channel)
  if (process.env.PUSHCUT_WEBHOOK_URL) {
    try {
      await fetch(process.env.PUSHCUT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: payload.title, text: payload.body }),
      });
    } catch (e) {
      console.error('[PUSHCUT] Delivery error:', e);
    }
  }
  return result;
}
