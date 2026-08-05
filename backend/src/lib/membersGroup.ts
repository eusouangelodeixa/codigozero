/**
 * Monitor do grupo do WhatsApp EXCLUSIVO de membros (assinantes).
 *
 * O admin escolhe o grupo do Komunika em /admin/grupo (salvo em
 * SystemConfig.membersGroupId/Name) e o link de convite (membersGroupInviteLink,
 * exibido no QG só pra assinante ativo — o grupo é privado, o Angelo aprova).
 *
 * computeMembersGroupStatus() puxa os participantes AO VIVO do WhatsApp (via
 * GET /api/v1/groups/{id}/metadata do Komunika) e cruza com a base de users
 * pelo telefone:
 *   - em dia  → assinatura ativa
 *   - equipe  → role admin/superadmin (nunca vai pra lista de remoção)
 *   - remover → user identificado com assinatura vencida/inativa
 *   - desconhecido → número sem user na base (segundo número do Angelo,
 *     equipe, convidado…) — listado à parte, NUNCA marcado pra remoção
 *     automática.
 *
 * A remoção real (POST /api/v1/groups/{id}/participants DELETE) fica em
 * /admin/grupo, por clique do admin — o sistema aponta, o humano decide.
 */
import { PrismaClient } from '@prisma/client';
import { getKomunikaApi } from './centralAnnounce';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/** Só os dígitos — telefones e JIDs viram chaves comparáveis. */
const digits = (s: string) => (s || '').split('@')[0].replace(/\D/g, '');

export interface GroupMemberRow {
  jid: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  subscriptionStatus?: string | null;
  subscriptionEnd?: Date | null;
}

export interface MembersGroupStatus {
  configured: boolean;
  error?: string;
  groupId?: string;
  groupName?: string | null;
  inviteLink?: string | null;
  counts?: { participants: number; ok: number; team: number; toRemove: number; unknown: number };
  toRemove?: GroupMemberRow[];
  unknown?: { jid: string; phone: string }[];
}

export async function computeMembersGroupStatus(): Promise<MembersGroupStatus> {
  const cfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  if (!cfg?.membersGroupId) {
    return { configured: false, inviteLink: cfg?.membersGroupInviteLink || null };
  }

  const api = await getKomunikaApi();
  if (!api) return { configured: true, groupId: cfg.membersGroupId, groupName: cfg.membersGroupName, error: 'Komunika não configurado (/admin/config)' };

  // Participantes AO VIVO (o Komunika consulta o WhatsApp na hora). Formato
  // atual: [{ jid, admin }] (admin = flag de admin DO GRUPO, patch de
  // 2026-08-05 no box); aceita também o formato antigo de strings.
  let participants: { jid: string; groupAdmin: boolean }[] = [];
  try {
    const r = await fetch(`${api.apiUrl}/api/v1/groups/${encodeURIComponent(cfg.membersGroupId)}/metadata`, {
      headers: { 'X-API-Key': api.apiKey },
    });
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      return {
        configured: true, groupId: cfg.membersGroupId, groupName: cfg.membersGroupName,
        error: `Komunika respondeu ${r.status} ao buscar participantes`,
      };
    }
    const raw: any[] = Array.isArray(d?.data?.participants) ? d.data.participants : [];
    participants = raw
      .map((p) => (typeof p === 'string' ? { jid: p, groupAdmin: false } : { jid: String(p?.jid || ''), groupAdmin: !!p?.admin }))
      .filter((p) => p.jid);
  } catch (e: any) {
    return {
      configured: true, groupId: cfg.membersGroupId, groupName: cfg.membersGroupName,
      error: e?.message || 'Erro de conexão com o Komunika',
    };
  }

  // Base de users por telefone (dígitos) — inclui variante sem o 258 pra
  // casar telefone gravado local (84…) com JID internacional (25884…).
  const users = await prisma.user.findMany({
    where: { phone: { not: '' } },
    select: { name: true, email: true, phone: true, role: true, subscriptionStatus: true, subscriptionEnd: true },
  });
  // Colisão de número (duas contas com o mesmo telefone): ganha a conta com
  // melhor status — admin/superadmin > assinatura ativa > resto. Sem isso, a
  // conta-lead do Angelo sobrescrevia a conta superadmin dele no cruzamento.
  const rank = (u: (typeof users)[number]) =>
    u.role === 'admin' || u.role === 'superadmin' ? 3 : u.subscriptionStatus === 'active' ? 2 : 1;
  const byPhone = new Map<string, (typeof users)[number]>();
  const put = (key: string, u: (typeof users)[number]) => {
    const cur = byPhone.get(key);
    if (!cur || rank(u) > rank(cur)) byPhone.set(key, u);
  };
  for (const u of users) {
    const d = digits(u.phone as string);
    if (!d) continue;
    put(d, u);
    if (d.length === 9 && d.startsWith('8')) put(`258${d}`, u);
  }

  const toRemove: GroupMemberRow[] = [];
  const unknown: { jid: string; phone: string }[] = [];
  let ok = 0;
  let team = 0;

  for (const p of participants) {
    const phone = digits(p.jid);
    if (!phone) continue;
    // ADMIN DO GRUPO = equipe, sempre (regra do Angelo): nunca vai pra
    // remoção nem pra "desconhecidos", tenha cadastro na base ou não.
    if (p.groupAdmin) {
      team++;
      continue;
    }
    const u = byPhone.get(phone);
    if (!u) {
      unknown.push({ jid: p.jid, phone });
      continue;
    }
    if (u.role === 'admin' || u.role === 'superadmin') {
      team++;
      continue;
    }
    if (u.subscriptionStatus === 'active') {
      ok++;
      continue;
    }
    toRemove.push({
      jid: p.jid,
      phone,
      name: u.name,
      email: u.email,
      subscriptionStatus: u.subscriptionStatus,
      subscriptionEnd: u.subscriptionEnd,
    });
  }

  return {
    configured: true,
    groupId: cfg.membersGroupId,
    groupName: cfg.membersGroupName,
    inviteLink: cfg.membersGroupInviteLink || null,
    counts: { participants: participants.length, ok, team, toRemove: toRemove.length, unknown: unknown.length },
    toRemove,
    unknown,
  };
}

/**
 * Chamada crua de remoção no Komunika (DELETE …/participants → Evolution
 * updateParticipant remove). Envia só os dígitos. Usada APENAS pelo
 * processador da fila — nunca direto da rota (anti-ban: a remoção é sempre
 * intervalada).
 */
async function removeFromMembersGroup(jids: string[]): Promise<{ ok: boolean; error?: string }> {
  const cfg = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  if (!cfg?.membersGroupId) return { ok: false, error: 'Grupo de membros não configurado' };
  const api = await getKomunikaApi();
  if (!api) return { ok: false, error: 'Komunika não configurado' };

  const participants = jids.map(digits).filter(Boolean);
  if (!participants.length) return { ok: false, error: 'Nenhum número válido' };

  try {
    const r = await fetch(`${api.apiUrl}/api/v1/groups/${encodeURIComponent(cfg.membersGroupId)}/participants`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': api.apiKey },
      body: JSON.stringify({ participants }),
    });
    if (r.ok) return { ok: true };
    const body = await r.text().catch(() => '');
    return { ok: false, error: `Komunika ${r.status}: ${body.slice(0, 160)}` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Erro de conexão com o Komunika' };
  }
}

// ── Fila de remoção intervalada (anti-ban) ──────────────────────────────────
// Remover pela API em rajada é o único padrão que poderia parecer robótico.
// Então: lotes de no MÁXIMO 3 números, com intervalo ALEATÓRIO de 10-15 min
// entre lotes — ritmo de admin humano. Estado do próximo lote em memória
// (reboot só faz o primeiro lote sair na hora; os seguintes voltam ao ritmo).
const REMOVAL_BATCH_SIZE = 3;
const REMOVAL_MIN_GAP_MS = 10 * 60 * 1000;
const REMOVAL_MAX_GAP_MS = 15 * 60 * 1000;
let nextRemovalBatchAt = 0;

/**
 * Agenda remoções (dedup: quem já está pendente não entra de novo). A rota
 * do admin chama isto — nada é removido na hora.
 */
export async function enqueueGroupRemovals(
  rows: { jid: string; phone: string; name?: string | null }[],
  requestedBy?: string | null,
): Promise<{ queued: number; alreadyQueued: number }> {
  let queued = 0;
  let alreadyQueued = 0;
  for (const row of rows) {
    const jid = (row.jid || '').trim();
    const phone = digits(row.phone || jid);
    if (!jid || !phone) continue;
    const pending = await prisma.groupRemovalQueue.findFirst({ where: { jid, status: 'pending' }, select: { id: true } });
    if (pending) {
      alreadyQueued++;
      continue;
    }
    await prisma.groupRemovalQueue.create({
      data: { jid, phone, name: row.name || null, requestedBy: requestedBy || null },
    });
    queued++;
  }
  return { queued, alreadyQueued };
}

/** Resumo da fila pro painel /admin/grupo. */
export async function getRemovalQueueSummary() {
  const [pending, lastDone] = await Promise.all([
    prisma.groupRemovalQueue.count({ where: { status: 'pending' } }),
    prisma.groupRemovalQueue.findFirst({ where: { status: { in: ['done', 'skipped', 'failed'] } }, orderBy: { processedAt: 'desc' } }),
  ]);
  const pendingJids = pending
    ? (await prisma.groupRemovalQueue.findMany({ where: { status: 'pending' }, select: { jid: true } })).map((r) => r.jid)
    : [];
  return { pending, pendingJids, lastProcessedAt: lastDone?.processedAt || null };
}

// Carência ANTES da remoção automática: vencido há menos de 3 dias ainda não
// entra na fila sozinho (muita renovação chega 1-2 dias atrasada, e os
// lembretes de expiração batem nesses dias). O admin pode antecipar à mão em
// /admin/grupo. Quem nunca teve assinatura (sem subscriptionEnd) não tem
// carência a contar — entra direto.
const AUTO_REMOVE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Tick diário: agenda SOZINHO a remoção dos participantes vencidos (passada a
 * carência). Dedup na fila; segurança final é a re-checagem na hora do lote.
 * Retorna contagens pro push do admin.
 */
export async function autoEnqueueExpired(): Promise<{ queued: number; alreadyQueued: number; inGrace: number } | { skipped: true }> {
  const status = await computeMembersGroupStatus();
  if (!status.configured || status.error || !status.toRemove?.length) return { skipped: true };

  const cutoff = Date.now() - AUTO_REMOVE_GRACE_MS;
  const eligible = status.toRemove.filter((r) => {
    if (!r.subscriptionEnd) return true; // nunca pagou — sem carência a contar
    return new Date(r.subscriptionEnd).getTime() < cutoff;
  });
  const inGrace = status.toRemove.length - eligible.length;
  if (!eligible.length) return { queued: 0, alreadyQueued: 0, inGrace };

  const r = await enqueueGroupRemovals(
    eligible.map((e) => ({ jid: e.jid, phone: e.phone, name: e.name })),
    'auto',
  );
  return { ...r, inGrace };
}

/**
 * Tick do cron (a cada minuto): processa NO MÁXIMO um lote de 3, e só quando
 * o intervalo aleatório de 10-15 min desde o lote anterior já passou. Antes
 * de remover, RE-CHECA a assinatura — quem renovou na espera é pulado.
 */
export async function processGroupRemovalQueue(): Promise<void> {
  const now = Date.now();
  if (now < nextRemovalBatchAt) return;

  const batch = await prisma.groupRemovalQueue.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: REMOVAL_BATCH_SIZE,
  });
  if (!batch.length) return;

  // Trava o ritmo JÁ (mesmo que o lote falhe, o próximo respeita o intervalo).
  nextRemovalBatchAt = now + REMOVAL_MIN_GAP_MS + Math.floor(Math.random() * (REMOVAL_MAX_GAP_MS - REMOVAL_MIN_GAP_MS));

  // Re-checagem de assinatura: renovou enquanto esperava → NUNCA remover.
  const toRemove: typeof batch = [];
  for (const item of batch) {
    const variants = item.phone.length === 12 && item.phone.startsWith('258') ? [item.phone, item.phone.slice(3)] : [item.phone];
    const user = await prisma.user.findFirst({
      where: { OR: variants.flatMap((v) => [{ phone: v }, { phone: `+${v}` }]) },
      select: { subscriptionStatus: true, role: true },
    });
    if (user && (user.subscriptionStatus === 'active' || user.role === 'admin' || user.role === 'superadmin')) {
      await prisma.groupRemovalQueue.update({
        where: { id: item.id },
        data: { status: 'skipped', processedAt: new Date(), error: 'assinatura ativa na hora do lote — não removido' },
      });
      console.log(`[MEMBERS-GROUP] ⏭️ ${item.phone} renovou na espera — removido da fila, não do grupo`);
      continue;
    }
    toRemove.push(item);
  }
  if (!toRemove.length) return;

  const r = await removeFromMembersGroup(toRemove.map((i) => i.jid));
  const processedAt = new Date();
  if (r.ok) {
    await prisma.groupRemovalQueue.updateMany({
      where: { id: { in: toRemove.map((i) => i.id) } },
      data: { status: 'done', processedAt },
    });
    console.log(`[MEMBERS-GROUP] 🚫 Lote removido do grupo: ${toRemove.map((i) => i.phone).join(', ')}`);
  } else {
    // Falha (Komunika fora etc.): re-tenta nos próximos lotes; após 5 falhas
    // marca failed pra não travar a fila.
    for (const item of toRemove) {
      const attempts = item.attempts + 1;
      await prisma.groupRemovalQueue.update({
        where: { id: item.id },
        data: attempts >= 5
          ? { status: 'failed', processedAt, attempts, error: r.error || 'falha' }
          : { attempts, error: r.error || 'falha' },
      });
    }
    console.warn(`[MEMBERS-GROUP] lote de remoção falhou (${r.error}) — re-tenta no próximo intervalo`);
  }
}
