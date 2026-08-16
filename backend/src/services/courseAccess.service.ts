import { PrismaClient } from '@prisma/client';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * Quem pode ver o quê na área de membros.
 *
 * Antes disto o acesso era binário: assinante activo via todos os cursos
 * publicados. Agora há dois eixos que se somam:
 *
 *  1. A ASSINATURA, que expira — dá entrada nos cursos `accessType:'subscription'`.
 *  2. O DIREITO AO CURSO (`CourseAccess`), que pode ser vitalício e sobrevive
 *     ao fim da assinatura.
 *
 * É a soma dos dois que resolve o caso da turma de mentoria: um mês de
 * plataforma inteira + o curso da mentoria para sempre. Quando o mês acaba,
 * o eixo 1 cai e o eixo 2 fica de pé.
 */

/** Estados de assinatura que dão entrada nos cursos incluídos no plano. */
const SUBSCRIPTION_GRANTS = new Set(['active', 'grace_period']);
/** Quem vê tudo, sempre. */
const PRIVILEGED_ROLES = new Set(['admin', 'superadmin']);

export type Viewer = { id: string; role?: string | null; subscriptionStatus?: string | null };

/** Direitos activos do utilizador (expirados não contam). */
export async function activeCourseAccessIds(userId: string): Promise<Set<string>> {
  const now = new Date();
  const rows = await prisma.courseAccess.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { courseId: true },
  });
  return new Set(rows.map((r) => r.courseId));
}

export type CourseLike = { id: string; accessType?: string | null; includedInSubscription?: boolean | null };

/** Curso é vendido à parte (tem vitrine + botão comprar)? */
function isSellable(course: CourseLike): boolean {
  return (course.accessType || 'subscription') === 'paid';
}

/** Curso é incluído na assinatura? Default true (histórico); só false quando
 *  explicitamente desmarcado (ou backfill de curso pago-só). */
function isIncludedInSubscription(course: CourseLike): boolean {
  return course.includedInSubscription !== false;
}

/**
 * Tem acesso COMPLETO a este curso?
 *
 * Repare que um `CourseAccess` vence sempre: é ele que mantém a turma de
 * mentoria dentro do curso depois de a assinatura cair, e é ele que abre um
 * curso pago a quem comprou sem ser assinante.
 */
export function hasFullAccess(
  viewer: Viewer,
  course: CourseLike,
  ownedCourseIds: Set<string>,
): boolean {
  if (PRIVILEGED_ROLES.has(String(viewer.role || ''))) return true;
  // CourseAccess individual SEMPRE dá entrada (vitalício / compra de fora —
  // que acessa só o que comprou). Independe dos eixos abaixo.
  if (ownedCourseIds.has(course.id)) return true;
  // Assinante em dia entra nos cursos incluídos na assinatura — vale também
  // para o curso HÍBRIDO (vendido à parte E incluído).
  if (isIncludedInSubscription(course)) {
    return SUBSCRIPTION_GRANTS.has(String(viewer.subscriptionStatus || ''));
  }
  return false;
}

/**
 * O curso deve aparecer na lista?
 *
 * Curso pago aparece SEMPRE (com cadeado) — a vitrine é o que vende. Curso
 * incluído no plano só aparece a quem tem plano ou direito próprio, senão
 * enchia a estante de quem não pode abrir nada.
 */
export function isVisible(
  viewer: Viewer,
  course: CourseLike,
  ownedCourseIds: Set<string>,
): boolean {
  if (isSellable(course)) return true;
  return hasFullAccess(viewer, course, ownedCourseIds);
}

/**
 * Um módulo abre para este utilizador?
 * Sem acesso completo, só os marcados como amostra.
 */
export function moduleUnlocked(fullAccess: boolean, module: { isFree?: boolean | null }): boolean {
  return fullAccess || !!module.isFree;
}

/**
 * Concede (ou estende) o direito a um curso.
 *
 * Idempotente por (utilizador, curso). Regra deliberada: **nunca encurtar** um
 * direito existente — se a pessoa já tem vitalício e chega uma concessão de 30
 * dias, o vitalício mantém-se. O contrário (temporário → vitalício) promove.
 */
export async function grantCourseAccess(args: {
  userId: string;
  courseId: string;
  source?: string;
  expiresAt?: Date | null;
  orderId?: string | null;
  grantedById?: string | null;
}): Promise<void> {
  const existing = await prisma.courseAccess.findUnique({
    where: { userId_courseId: { userId: args.userId, courseId: args.courseId } },
    select: { id: true, expiresAt: true },
  });

  if (!existing) {
    await prisma.courseAccess.create({
      data: {
        userId: args.userId,
        courseId: args.courseId,
        source: args.source || 'manual',
        expiresAt: args.expiresAt ?? null,
        orderId: args.orderId ?? null,
        grantedById: args.grantedById ?? null,
      },
    });
    return;
  }

  const jaVitalicio = existing.expiresAt === null;
  const novoVitalicio = (args.expiresAt ?? null) === null;
  if (jaVitalicio && !novoVitalicio) return; // nunca rebaixar

  const maisLonge =
    novoVitalicio || !existing.expiresAt || (args.expiresAt as Date) > existing.expiresAt;
  if (!maisLonge) return;

  await prisma.courseAccess.update({
    where: { id: existing.id },
    data: {
      expiresAt: args.expiresAt ?? null,
      source: args.source || 'manual',
      orderId: args.orderId ?? undefined,
    },
  });
}

/** Tem algum direito activo? Usado para deixar entrar quem não é assinante. */
export async function hasAnyCourseAccess(userId: string): Promise<boolean> {
  const now = new Date();
  const count = await prisma.courseAccess.count({
    where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
  return count > 0;
}
