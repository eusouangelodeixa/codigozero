import { PrismaClient } from '@prisma/client';
import {
  generateUserPassword,
  sendCredentialsEmail,
  sendCredentialsViaWhatsApp,
} from './payment.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * Entrega de credenciais em massa — e-mail primeiro, WhatsApp só em último caso.
 *
 * A ordem não é estética. O e-mail é barato, tem tecto diário conhecido e não
 * queima nada; o WhatsApp sai por um número PARTILHADO por toda a operação, e
 * uma rajada para uma turma inteira é o caminho mais curto para o ban — o que
 * derrubaria também a recuperação de senha, os avisos de renovação e o suporte.
 *
 * Por isso: enquanto houver orçamento de e-mail do dia, tudo vai por e-mail.
 * Quando ele acaba (contador no tecto, ou o próprio Resend a recusar por
 * limite), o que sobra passa para WhatsApp com 15–20 minutos ENTRE pessoas.
 *
 * A fila é persistida (`CredentialDelivery`) porque, nesse ritmo, uma turma
 * grande demora horas ou dias — um laço em memória morria no primeiro deploy.
 * A senha não é guardada: é gerada no instante do envio e gravada no
 * utilizador nesse momento.
 */

/** Espaçamento entre mensagens de WhatsApp da mesma leva. */
const WHATSAPP_GAP_MIN_MS = 15 * 60 * 1000;
const WHATSAPP_GAP_MAX_MS = 20 * 60 * 1000;

const hoje = () => new Date().toISOString().slice(0, 10);

type QuotaState = { limit: number; used: number; exhausted: boolean };

/** Lê o orçamento do dia, virando o contador quando muda o dia. */
async function readQuota(): Promise<QuotaState> {
  const cfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const limit = cfg?.emailDailyLimit ?? 100;

  if (cfg?.emailQuotaDate !== hoje()) {
    await prisma.systemConfig.upsert({
      where: { id: 'singleton' },
      update: { emailQuotaDate: hoje(), emailQuotaUsed: 0, emailQuotaExhausted: false },
      create: { id: 'singleton', emailQuotaDate: hoje(), emailQuotaUsed: 0, emailQuotaExhausted: false },
    });
    return { limit, used: 0, exhausted: false };
  }
  return { limit, used: cfg?.emailQuotaUsed ?? 0, exhausted: !!cfg?.emailQuotaExhausted };
}

async function bumpQuota(): Promise<void> {
  await prisma.systemConfig.update({
    where: { id: 'singleton' },
    data: { emailQuotaUsed: { increment: 1 }, emailQuotaDate: hoje() },
  });
}

/** O Resend recusou por limite — fecha o e-mail para o resto do dia. */
export async function markEmailQuotaExhausted(): Promise<void> {
  await prisma.systemConfig
    .update({ where: { id: 'singleton' }, data: { emailQuotaExhausted: true, emailQuotaDate: hoje() } })
    .catch(() => {});
  console.warn('[ENTREGA] quota de e-mail esgotada — o resto da fila passa para WhatsApp');
}

/** Põe alguém na fila (idempotente por utilizador). `productName` entra na
 *  mensagem para o aluno saber O QUE foi desbloqueado (ex.: o curso da turma).
 *
 *  `reset: true` re-arma uma linha já enviada/falhada — usado pela COMPRA no
 *  webhook, onde a entrega tem de acontecer mesmo que a pessoa já tenha
 *  recebido credenciais de uma turma no passado. `dueAt` adia o primeiro
 *  processamento (período de graça enquanto a entrega imediata tenta). */
export async function enqueueCredentialDelivery(
  userId: string,
  batch?: string,
  productName?: string,
  opts?: { reset?: boolean; dueAt?: Date },
): Promise<void> {
  await prisma.credentialDelivery.upsert({
    where: { userId },
    update: opts?.reset
      ? {
          status: 'pending',
          attempts: 0,
          lastError: null,
          channel: 'email',
          dueAt: opts?.dueAt ?? new Date(),
          ...(batch ? { batch } : {}),
          ...(productName ? { productName } : {}),
        }
      : { ...(productName ? { productName } : {}) },
    create: {
      userId,
      batch: batch ?? null,
      productName: productName ?? null,
      ...(opts?.dueAt ? { dueAt: opts.dueAt } : {}),
    },
  });
}

/** Marca a entrega como feita por fora da fila (ex.: a tentativa imediata do
 *  webhook funcionou) — o tick vê status 'sent' e não re-envia. */
export async function markCredentialDelivered(
  userId: string,
  channel: 'email' | 'whatsapp',
): Promise<void> {
  try {
    await prisma.credentialDelivery.updateMany({
      where: { userId, status: 'pending' },
      data: { status: 'sent', channel, sentAt: new Date() },
    });
  } catch (e: any) {
    console.error('[ENTREGA] markCredentialDelivered falhou:', e?.message || e);
  }
}

/** Quando pode sair a próxima mensagem de WhatsApp, respeitando o intervalo. */
async function nextWhatsappSlot(): Promise<Date> {
  const ultimo = await prisma.credentialDelivery.findFirst({
    where: { channel: 'whatsapp', sentAt: { not: null } },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true },
  });
  const gap = WHATSAPP_GAP_MIN_MS + Math.random() * (WHATSAPP_GAP_MAX_MS - WHATSAPP_GAP_MIN_MS);
  const base = ultimo?.sentAt ? ultimo.sentAt.getTime() + gap : Date.now();
  return new Date(Math.max(base, Date.now()));
}

/**
 * Tick da fila. Processa NO MÁXIMO uma pessoa por chamada — o cron corre a
 * cada minuto, o que dá um ritmo de e-mail civilizado e respeita o intervalo
 * longo do WhatsApp sem prender o processo.
 */
export async function processCredentialDeliveries(): Promise<{ sent: number; channel?: string }> {
  const agora = new Date();

  const proximo = await prisma.credentialDelivery.findFirst({
    where: { status: 'pending', dueAt: { lte: agora } },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, email: true, phone: true } } },
  });
  if (!proximo) return { sent: 0 };

  // CLAIM atômico: empurra o dueAt 5 min pra frente guardado pelo valor
  // atual. Dois ticks concorrentes (2ª réplica, cron duplicado) não enviam a
  // mesma pessoa duas vezes; um crash no meio só re-agenda em 5 min — sem
  // estado novo, sem linha presa.
  const claim = await prisma.credentialDelivery.updateMany({
    where: { id: proximo.id, status: 'pending', dueAt: proximo.dueAt },
    data: { dueAt: new Date(agora.getTime() + 5 * 60 * 1000) },
  });
  if (claim.count === 0) return { sent: 0 };

  const quota = await readQuota();
  const temEmailReal = !!proximo.user.email && !proximo.user.email.endsWith('@lead.czero.sbs');
  const podeEmail = temEmailReal && !quota.exhausted && quota.used < quota.limit;

  // Sem orçamento de e-mail: passa para WhatsApp, mas só quando o intervalo
  // permitir — nunca em rajada.
  if (proximo.channel === 'email' && !podeEmail) {
    const temTelefone = !!proximo.user.phone && !proximo.user.phone.startsWith('turma_');
    if (!temTelefone) {
      await prisma.credentialDelivery.update({
        where: { id: proximo.id },
        data: { status: 'failed', lastError: 'sem e-mail utilizável nem telefone' },
      });
      return { sent: 0 };
    }
    await prisma.credentialDelivery.update({
      where: { id: proximo.id },
      data: { channel: 'whatsapp', dueAt: await nextWhatsappSlot() },
    });
    return { sent: 0 };
  }

  // Senha gerada agora e gravada já — nunca fica à espera em tabela nenhuma.
  const { raw, hash } = await generateUserPassword();
  await prisma.user.update({ where: { id: proximo.user.id }, data: { passwordHash: hash } });

  let ok = false;
  let erro: string | null = null;

  if (proximo.channel === 'email') {
    const r = await sendCredentialsEmail({
      name: proximo.user.name,
      email: proximo.user.email,
      rawPassword: raw,
      productName: proximo.productName ?? undefined,
    }).catch((e: any) => ({ ok: false, status: e?.message || 'erro' }) as any);
    ok = !!r?.ok;
    if (ok) await bumpQuota();
    else erro = `email: ${r?.status ?? 'falhou'}`;
  } else {
    const r = await sendCredentialsViaWhatsApp({
      phone: proximo.user.phone,
      email: proximo.user.email,
      rawPassword: raw,
      productName: proximo.productName ?? undefined,
    }).catch((e: any) => ({ delivered: false, status: e?.message || 'erro' }) as any);
    // BUG histórico: aqui se checava `r.ok`, mas o helper devolve `delivered`
    // — TODA entrega WhatsApp da fila era marcada como falha mesmo quando o
    // cliente recebia (e a senha era re-rotacionada na tentativa seguinte).
    ok = !!(r as any)?.delivered;
    if (!ok) erro = `whatsapp: ${(r as any)?.status ?? 'falhou'}`;
  }

  const tentativas = proximo.attempts + 1;
  const desistiu = !ok && tentativas >= 3;
  await prisma.credentialDelivery.update({
    where: { id: proximo.id },
    data: ok
      ? { status: 'sent', sentAt: new Date(), attempts: tentativas, lastError: null }
      : {
          // 3 tentativas antes de desistir; o reenvio manual continua a existir
          // em /admin/users para os casos que sobram.
          status: desistiu ? 'failed' : 'pending',
          attempts: tentativas,
          lastError: erro,
          dueAt: new Date(Date.now() + 10 * 60 * 1000),
        },
  });

  // Falha terminal deixa o usuário com uma senha que NINGUÉM conhece (ela é
  // rotacionada a cada tentativa de envio) — o admin precisa saber NA HORA
  // para reenviar por /admin/users, senão vira o caso do comprador trancado.
  if (desistiu) {
    const { sendPushToSuperAdmins } = await import('./push.service');
    sendPushToSuperAdmins({
      title: '🚨 Credenciais não entregues (fila)',
      body: `${proximo.user.email} — 3 tentativas falharam (${erro}). Reenvie em /admin/users.`,
      url: '/admin/users',
    }).catch(() => {});
  }

  if (ok) console.log(`[ENTREGA] ✅ ${proximo.channel} → ${proximo.user.email}`);
  return { sent: ok ? 1 : 0, channel: proximo.channel };
}

/** Resumo para o painel do admin. */
export async function deliveryStats(): Promise<Record<string, number>> {
  const rows = await prisma.credentialDelivery.groupBy({ by: ['status'], _count: true });
  const out: Record<string, number> = { pending: 0, sent: 0, failed: 0 };
  for (const r of rows) out[r.status] = r._count;
  return out;
}
