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

  // Participantes AO VIVO (o Komunika consulta o WhatsApp na hora).
  let participants: string[] = [];
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
    participants = Array.isArray(d?.data?.participants) ? d.data.participants.filter((p: any) => typeof p === 'string') : [];
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
  const byPhone = new Map<string, (typeof users)[number]>();
  for (const u of users) {
    const d = digits(u.phone as string);
    if (!d) continue;
    byPhone.set(d, u);
    if (d.length === 9 && d.startsWith('8')) byPhone.set(`258${d}`, u);
  }

  const toRemove: GroupMemberRow[] = [];
  const unknown: { jid: string; phone: string }[] = [];
  let ok = 0;
  let team = 0;

  for (const jid of participants) {
    const phone = digits(jid);
    if (!phone) continue;
    const u = byPhone.get(phone);
    if (!u) {
      unknown.push({ jid, phone });
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
      jid,
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
 * Remove participantes do grupo de membros (DELETE …/participants no
 * Komunika → Evolution updateParticipant remove). Recebe JIDs/números; envia
 * só os dígitos. Retorna ok/erro — quem chama decide o feedback.
 */
export async function removeFromMembersGroup(jids: string[]): Promise<{ ok: boolean; error?: string }> {
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
