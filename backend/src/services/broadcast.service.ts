import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { lojouService, LojouService } from './lojou.service';
import { sendPushBroadcast } from './push.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Disparo em massa do admin — PERSISTIDO (tabelas AdminBroadcast +
 * AdminBroadcastRecipient).
 *
 * Antes o job inteiro vivia num Map em memória do processo: um deploy no meio
 * de um disparo de horas matava o loop sem registro de quem já tinha recebido,
 * sem resume, e re-disparar duplicava mensagens no número compartilhado (que
 * já foi banido uma vez). Agora:
 *   - cada destinatário tem a sua linha (claim atômico → sem duplicata);
 *   - pausa/retomada/parada vivem no BANCO — valem de qualquer processo;
 *   - o boot retoma jobs `running` interrompidos (resumeInterruptedBroadcasts);
 *   - o progresso do painel é lido do banco, não da sorte do processo.
 */

export function substituteVariables(message: string, user: any): string {
  const survey = (typeof user.surveyAnswers === 'object' && user.surveyAnswers) || {};
  return message
    .replace(/\{\{nome\}\}/gi, user.name || '')
    .replace(/\{\{email\}\}/gi, user.email || '')
    .replace(/\{\{telefone\}\}/gi, user.phone || '')
    .replace(/\{\{objetivo\}\}/gi, survey.goal || '')
    .replace(/\{\{dor\}\}/gi, survey.pain || '')
    .replace(/\{\{compromisso\}\}/gi, survey.commitment || '')
    .replace(/\{\{consciencia\}\}/gi, survey.awareness || '');
}

// Runners ativos NESTE processo (evita dois loops pro mesmo job após um
// resume). A verdade sobre o estado do job continua sendo o banco.
const activeRunners = new Set<string>();

export async function startAdminBroadcast(opts: {
  users: Array<{ id: string; name: string; email: string; phone: string }>;
  message: string;
  instanceId?: string | null;
  delayMin: number;
  delayMax: number;
  sendPush: boolean;
  generateCoupons: boolean;
  couponDiscount?: number | null;
  couponMaxUses?: number | null;
  createdBy?: string | null;
}): Promise<{ jobId: string; total: number }> {
  const job = await prisma.adminBroadcast.create({
    data: {
      message: opts.message,
      instanceId: opts.instanceId || null,
      delayMin: Math.max(1, opts.delayMin || 5),
      delayMax: Math.max(Math.max(1, opts.delayMin || 5), opts.delayMax || 15),
      sendPush: !!opts.sendPush,
      generateCoupons: !!opts.generateCoupons,
      couponDiscount: opts.couponDiscount ?? null,
      couponMaxUses: opts.couponMaxUses ?? null,
      total: opts.users.length,
      createdBy: opts.createdBy ?? null,
    },
  });
  // Uma INSERT em lote — não uma por destinatário.
  await prisma.adminBroadcastRecipient.createMany({
    data: opts.users.map((u) => ({ jobId: job.id, userId: u.id, name: u.name, phone: u.phone })),
  });
  launchRunner(job.id);
  return { jobId: job.id, total: opts.users.length };
}

export function launchRunner(jobId: string): void {
  if (activeRunners.has(jobId)) return;
  activeRunners.add(jobId);
  void runAdminBroadcast(jobId)
    .catch(async (err: any) => {
      console.error('[BROADCAST] runner falhou:', err?.message || err);
      await prisma.adminBroadcast
        .updateMany({
          where: { id: jobId, status: { in: ['running', 'paused'] } },
          data: { status: 'error', error: err?.message || String(err), finishedAt: new Date() },
        })
        .catch(() => {});
    })
    .finally(() => activeRunners.delete(jobId));
}

/** Chamado no boot: retoma disparos que um restart interrompeu. */
export async function resumeInterruptedBroadcasts(): Promise<void> {
  try {
    const jobs = await prisma.adminBroadcast.findMany({
      where: { status: 'running' },
      select: { id: true },
    });
    for (const j of jobs) {
      console.log(`[BROADCAST] ♻️ retomando disparo interrompido ${j.id}`);
      launchRunner(j.id);
    }
  } catch (e: any) {
    console.error('[BROADCAST] resume no boot falhou:', e?.message || e);
  }
}

async function runAdminBroadcast(jobId: string): Promise<void> {
  const job = await prisma.adminBroadcast.findUnique({ where: { id: jobId } });
  if (!job) return;

  const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const apiKey = sysConfig?.komunikaAdminApiKey || env.KOMUNIKA_ADMIN_API_KEY;
  const apiUrl = env.KOMUNIKA_API_URL || 'https://api.komunika.site';
  const sendWhatsApp = !!job.instanceId && !!apiKey;

  while (sendWhatsApp) {
    // O estado mora no banco: pausa/parada feitas por QUALQUER request (ou até
    // outro processo) valem aqui na iteração seguinte.
    const st = await prisma.adminBroadcast.findUnique({
      where: { id: jobId },
      select: { status: true, delayMin: true, delayMax: true },
    });
    if (!st) return;
    if (st.status === 'paused') {
      await sleep(3000);
      continue;
    }
    if (st.status !== 'running') return; // stopped/done/error

    // Claim atômico do próximo destinatário — replica-safe e crash-safe:
    // quem "perde" a corrida do updateMany simplesmente pega o seguinte.
    const next = await prisma.adminBroadcastRecipient.findFirst({
      where: { jobId, status: 'pending' },
      orderBy: { createdAt: 'asc' },
    });
    if (!next) break;
    const claim = await prisma.adminBroadcastRecipient.updateMany({
      where: { id: next.id, status: 'pending' },
      data: { status: 'sending' },
    });
    if (claim.count === 0) continue;

    let cleanPhone = (next.phone || '').replace(/\D/g, '');
    if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) cleanPhone = `258${cleanPhone}`;
    if (cleanPhone.length < 9) {
      await prisma.adminBroadcastRecipient.update({
        where: { id: next.id },
        data: { status: 'skipped', error: 'Telefone inválido' },
      });
      await prisma.adminBroadcast.update({ where: { id: jobId }, data: { failed: { increment: 1 } } });
      continue;
    }

    const user = await prisma.user.findUnique({
      where: { id: next.userId },
      select: { id: true, name: true, email: true, phone: true, surveyAnswers: true },
    });
    let personalizedMsg = substituteVariables(job.message, user || { name: next.name, phone: next.phone });
    if (job.generateCoupons && /\{\{cupom\}\}/i.test(job.message) && user) {
      const code = await ensureBroadcastCoupon(jobId, user, job.couponDiscount, job.couponMaxUses);
      personalizedMsg = personalizedMsg.replace(/\{\{cupom\}\}/gi, code);
    }

    let ok = false;
    let error: string | null = null;
    try {
      const res = await fetch(`${apiUrl}/api/v1/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey! },
        body: JSON.stringify({ instanceId: job.instanceId, to: cleanPhone, type: 'text', content: personalizedMsg }),
        signal: AbortSignal.timeout(15000),
      });
      ok = res.ok;
      if (!ok) error = `HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`;
    } catch (e: any) {
      error = e?.message || 'erro de rede';
    }

    await prisma.adminBroadcastRecipient.update({
      where: { id: next.id },
      data: { status: ok ? 'sent' : 'failed', error, sentAt: ok ? new Date() : null },
    });
    await prisma.adminBroadcast.update({
      where: { id: jobId },
      data: ok ? { sent: { increment: 1 } } : { failed: { increment: 1 } },
    });

    // Espera anti-bloqueio em fatias de 3s, re-checando o status — a pausa e o
    // stop pegam no meio da espera, não depois dela.
    const delay = Math.floor(Math.random() * (st.delayMax - st.delayMin + 1)) + st.delayMin;
    for (let s = 0; s < delay; s += 3) {
      const cur = await prisma.adminBroadcast.findUnique({ where: { id: jobId }, select: { status: true } });
      if (!cur || cur.status !== 'running') break;
      await sleep(Math.min(3, delay - s) * 1000);
    }
  }

  // Fila vazia (ou modo só-push): fecha o job se ninguém o parou antes.
  const fin = await prisma.adminBroadcast.findUnique({ where: { id: jobId } });
  if (!fin) return;
  const closed = await prisma.adminBroadcast.updateMany({
    where: { id: jobId, status: 'running' },
    data: {
      status: 'done',
      finishedAt: new Date(),
      ...(sendWhatsApp ? {} : { sent: fin.total }),
    },
  });
  if (closed.count === 0) return;

  if (fin.sendPush) {
    const pushBody = fin.message
      .replace(/\{\{[^}]+\}\}/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    sendPushBroadcast(
      {
        title: 'Código Zero',
        body: pushBody.length > 120 ? pushBody.substring(0, 120) + '...' : pushBody,
        url: '/dashboard',
      },
      'promotions',
    ).catch(() => {});
  }
  console.log(`[BROADCAST] ✅ job ${jobId} concluído`);
}

/**
 * Cria (ou reusa) o cupom por destinatário, sincronizado com a Lojou e a
 * tabela local — idêntico ao comportamento antigo, mas o contador vive no job
 * persistido.
 */
async function ensureBroadcastCoupon(
  jobId: string,
  user: { id: string; name: string | null; email: string },
  couponDiscount: number | null,
  couponMaxUses: number | null,
): Promise<string> {
  const discount = couponDiscount || 10;
  const maxUses = couponMaxUses || 1;
  const code = `CZ${discount}_${user.id.slice(0, 6).toUpperCase()}`;

  const existing = await prisma.coupon.findUnique({ where: { code } }).catch(() => null);
  if (existing) return code;

  let lojouId: string | null = null;
  if (env.LOJOU_API_KEY) {
    try {
      const product_ids = env.LOJOU_PRODUCT_ID
        ? [Number.isNaN(Number(env.LOJOU_PRODUCT_ID)) ? env.LOJOU_PRODUCT_ID : Number(env.LOJOU_PRODUCT_ID)]
        : undefined;
      const resp = await lojouService.createDiscount({
        code,
        type: 'percentage',
        value: discount,
        uses_limit: maxUses,
        status: 'active',
        ...(product_ids ? { product_ids } : {}),
      });
      lojouId = LojouService.extractDiscountId(resp);
      console.log(`[BROADCAST] 🎟️ Coupon ${code} created for ${user.email}${lojouId ? ` [Lojou: ${lojouId}]` : ''}`);
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (!msg.includes('(409)')) {
        console.warn(`[BROADCAST] Coupon error for ${user.email}:`, msg);
        return code;
      }
    }
  } else {
    console.warn(`[BROADCAST] LOJOU_API_KEY não configurada — cupom ${code} só substituído no texto`);
    return code;
  }

  try {
    await prisma.coupon.create({
      data: {
        code, type: 'percentage', value: discount, maxUses,
        active: true, lojouId, linkedUserId: user.id, linkedUserEmail: user.email,
      },
    });
    await prisma.adminBroadcast.update({ where: { id: jobId }, data: { coupons: { increment: 1 } } });
  } catch {
    // Corrida de unique constraint — seguro ignorar.
  }
  return code;
}

/**
 * Estado do job para o painel: o mesmo shape que o frontend já conhecia
 * (status, contadores e um `log` de eventos), agora derivado do banco.
 */
export async function getBroadcastState(jobId: string): Promise<any | null> {
  const job = await prisma.adminBroadcast.findUnique({ where: { id: jobId } });
  if (!job) return null;
  const processed = await prisma.adminBroadcastRecipient.findMany({
    where: { jobId, status: { in: ['sent', 'failed', 'skipped'] } },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  const base = { total: job.total, sent: job.sent, failed: job.failed, coupons: job.coupons };
  const log: any[] = [{ type: 'start', ...base }];
  for (const r of processed.reverse()) {
    log.push({
      type: r.status === 'sent' ? 'sent' : r.status === 'skipped' ? 'skip' : 'error',
      name: r.name,
      phone: r.phone,
      reason: r.status === 'skipped' ? r.error : undefined,
      error: r.status === 'failed' ? r.error : undefined,
      ...base,
    });
  }
  if (job.status === 'paused') log.push({ type: 'paused', ...base });
  if (job.status === 'stopped') log.push({ type: 'stopped', ...base });
  if (job.status === 'done') log.push({ type: 'complete', ...base });
  if (job.status === 'error') log.push({ type: 'fatal', error: job.error, ...base });

  return {
    id: job.id,
    status: job.status,
    total: job.total,
    sent: job.sent,
    failed: job.failed,
    coupons: job.coupons,
    error: job.error,
    startedAt: job.startedAt.getTime(),
    finishedAt: job.finishedAt?.getTime() ?? undefined,
    log,
  };
}
