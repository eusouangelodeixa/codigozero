import { PrismaClient } from '@prisma/client';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * Feed de atividade do painel admin (aba Atividade): UMA linha por evento
 * operacional, visível a todos os admins. O push aos superadmins continua
 * saindo por sendPushToSuperAdmins — isto é o registro consultável, para o
 * admin que não estava com o telefone na mão na hora.
 *
 * Nunca lança: registrar atividade não pode derrubar uma venda.
 */
export async function logAdminEvent(ev: {
  /** course_sale | copro_enroll | ... */
  type: string;
  title: string;
  body?: string | null;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.adminEvent.create({
      data: {
        type: ev.type,
        title: ev.title,
        body: ev.body ?? null,
        meta: (ev.meta as any) ?? undefined,
      },
    });
  } catch (e: any) {
    console.error('[ADMIN-EVENT] falhou (não-bloqueante):', e?.message || e);
  }
}
