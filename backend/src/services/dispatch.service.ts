import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export interface DispatchContact {
  phone: string;
  name?: string;
  variables?: Record<string, string>;
}

export interface DispatchPayload {
  contacts: DispatchContact[];
  message?: string;
  dispatchMode?: 'message' | 'funnel';
  type?: 'text' | 'document' | 'audio';
  mediaUrl?: string;
  funnelId?: string;
  delayMinSec?: number;
  delayMaxSec?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function randomDelayMs(minSec: number, maxSec: number) {
  const min = Math.max(0, minSec);
  const max = Math.max(min, maxSec);
  const sec = min + Math.random() * (max - min);
  return Math.round(sec * 1000);
}

function applyTemplate(template: string, contact: DispatchContact): string {
  let out = template
    .replace(/\{\{nome\}\}/gi, contact.name || contact.variables?.nome || '')
    .replace(/\{\{telefone\}\}/gi, contact.phone || '')
    .replace(/\{\{negocio\}\}/gi, contact.variables?.negocio || contact.name || '');
  if (contact.variables) {
    for (const [k, v] of Object.entries(contact.variables)) {
      out = out.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), v ?? '');
    }
  }
  return out;
}

/**
 * Execute a queued dispatch row. Reads the payload, walks contacts, sleeps
 * between sends, writes DispatchLog rows, and updates counters on the
 * ScheduledDispatch row. Runs to completion in the background — does NOT
 * throw on per-contact errors; only top-level setup failures propagate.
 */
export async function processDispatch(scheduleId: string): Promise<void> {
  // Lock — set status to 'running' atomically. If another worker grabbed it,
  // bail out.
  const claim = await prisma.scheduledDispatch.updateMany({
    where: { id: scheduleId, status: 'pending' },
    data: { status: 'running', startedAt: new Date() },
  });
  if (claim.count === 0) return;

  const row = await prisma.scheduledDispatch.findUnique({ where: { id: scheduleId } });
  if (!row) return;

  const payload = row.payload as unknown as DispatchPayload;
  const contacts = payload.contacts ?? [];
  const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';

  const user = await prisma.user.findUnique({ where: { id: row.userId } });
  if (!user || !user.komunikaApiKey || !user.komunikaInstanceId) {
    await prisma.scheduledDispatch.update({
      where: { id: scheduleId },
      data: {
        status: 'failed',
        error: 'Credenciais do Komunika não configuradas',
        completedAt: new Date(),
      },
    });
    return;
  }

  const minSec = Math.max(0, payload.delayMinSec ?? 5);
  const maxSec = Math.max(minSec, payload.delayMaxSec ?? 15);

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    // Allow cancellation between sends
    const fresh = await prisma.scheduledDispatch.findUnique({
      where: { id: scheduleId },
      select: { status: true },
    });
    if (!fresh || fresh.status === 'cancelled') {
      await prisma.scheduledDispatch.update({
        where: { id: scheduleId },
        data: { status: 'cancelled', completedAt: new Date(), sent, failed },
      });
      return;
    }

    const contact = contacts[i];
    const cleanPhone = (contact.phone ?? '').replace(/\D/g, '');
    const template = payload.message ?? '';
    const personalized = template ? applyTemplate(template, contact) : '';

    try {
      let response: Response;
      if (payload.dispatchMode === 'funnel') {
        response = await fetch(`${apiUrl}/api/v1/funnels/${payload.funnelId}/add-lead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': user.komunikaApiKey,
          },
          body: JSON.stringify({
            phone: cleanPhone,
            name: contact.name,
            customFields: contact.variables || {},
          }),
        });
      } else {
        response = await fetch(`${apiUrl}/api/v1/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': user.komunikaApiKey,
          },
          body: JSON.stringify({
            instanceId: user.komunikaInstanceId,
            to: cleanPhone,
            type: payload.type ?? 'text',
            mediaUrl: payload.mediaUrl,
            fileName: payload.mediaUrl ? payload.mediaUrl.split('/').pop() : undefined,
            ...(personalized ? { content: personalized } : {}),
          }),
        });
      }

      const data = await response.json().catch(() => null);
      const recordedMsg =
        payload.dispatchMode === 'funnel' ? `[Injetado no Funil: ${payload.funnelId}]` : personalized;

      if (response.ok) {
        sent++;
        await prisma.dispatchLog.create({
          data: {
            userId: row.userId,
            phone: contact.phone,
            contactName: contact.name,
            message: recordedMsg,
            status: 'sent',
            scheduleId,
          },
        });
      } else {
        failed++;
        const errMsg = data?.error || data?.message || `HTTP ${response.status}`;
        await prisma.dispatchLog.create({
          data: {
            userId: row.userId,
            phone: contact.phone,
            contactName: contact.name,
            message: recordedMsg,
            status: 'failed',
            error: errMsg,
            scheduleId,
          },
        });
      }
    } catch (err) {
      failed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      await prisma.dispatchLog.create({
        data: {
          userId: row.userId,
          phone: contact.phone,
          contactName: contact.name,
          message: payload.message ?? '',
          status: 'failed',
          error: errMsg,
          scheduleId,
        },
      });
    }

    // Periodically persist progress so UI can poll
    await prisma.scheduledDispatch.update({
      where: { id: scheduleId },
      data: { sent, failed },
    });

    // Sleep between sends (skip after last contact)
    if (i < contacts.length - 1) {
      await sleep(randomDelayMs(minSec, maxSec));
    }
  }

  await prisma.scheduledDispatch.update({
    where: { id: scheduleId },
    data: {
      status: failed > 0 && sent === 0 ? 'failed' : 'completed',
      sent,
      failed,
      completedAt: new Date(),
    },
  });

  console.log(
    `[DISPATCH] schedule=${scheduleId} done: sent=${sent} failed=${failed} total=${contacts.length}`,
  );
}

/**
 * Cron entrypoint — picks up due pending dispatches and fires them.
 * Fire-and-forget: each dispatch runs to completion in the background.
 */
export async function processDueDispatches(): Promise<number> {
  const due = await prisma.scheduledDispatch.findMany({
    where: { status: 'pending', scheduledAt: { lte: new Date() } },
    select: { id: true },
    take: 25,
  });
  for (const { id } of due) {
    processDispatch(id).catch((e) => console.error('[DISPATCH] cron error', id, e));
  }
  return due.length;
}

export async function createScheduledDispatch(
  userId: string,
  scheduledAt: Date,
  payload: DispatchPayload,
  name?: string | null,
) {
  return prisma.scheduledDispatch.create({
    data: {
      userId,
      name: name?.trim()?.slice(0, 120) || null,
      scheduledAt,
      status: 'pending',
      payload: payload as unknown as Prisma.InputJsonValue,
      total: payload.contacts?.length ?? 0,
    },
  });
}
