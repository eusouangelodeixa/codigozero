import { PrismaClient } from '@prisma/client';
import { grantCourseAccess } from './courseAccess.service';
import { normalizeMzPhone, sendWhatsAppMessage } from '../lib/whatsapp';
import { generateUserPassword } from './payment.service';
import { enqueueCredentialDelivery } from './credentialDelivery.service';
import { scheduleSaveContactReminder } from './onboarding.service';
import { syncKomunikaOnApprovedOrder } from './komunika.service';
import { randomUUID } from 'crypto';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

/**
 * Matrícula de uma TURMA em massa (mentoria, parceria, lote comprado fora).
 *
 * O caso que motivou isto: entrar com a turma da mentoria de COD dando, à
 * mesma pessoa, duas coisas com prazos diferentes —
 *   • acesso VITALÍCIO ao curso da mentoria (CourseAccess sem expiração), e
 *   • acesso temporário à plataforma toda (assinatura de N dias).
 * Quando o prazo curto acaba, a pessoa perde o resto e fica só com o curso.
 *
 * Cada aluno entra exactamente como um aluno normal entra (mesma criação de
 * conta, mesma senha, mesmos canais de credenciais, mesmo tenant Komunika) —
 * a diferença é o direito ao curso e o vínculo ao coprodutor.
 */

export type BulkEntry = { name?: string; email?: string; phone?: string };

export type BulkResult = {
  total: number;
  created: number;
  reused: number;
  skipped: Array<{ line: number; reason: string; raw: string }>;
};

/**
 * Aceita lista colada em texto: uma pessoa por linha, campos separados por
 * vírgula, ponto-e-vírgula ou tab. Ordem livre entre nome/e-mail/telefone —
 * o e-mail identifica-se pelo "@" e o telefone por ser só dígitos.
 */
export function parseBulkList(raw: string): { entries: BulkEntry[]; skipped: BulkResult['skipped'] } {
  const entries: BulkEntry[] = [];
  const skipped: BulkResult['skipped'] = [];

  raw.split(/\r?\n/).forEach((line, i) => {
    const texto = line.trim();
    if (!texto) return;
    // Cabeçalho de planilha colado junto — ignora em silêncio.
    if (/^(nome|name)\b/i.test(texto) && /email/i.test(texto)) return;

    const partes = texto.split(/[,;\t]/).map((p) => p.trim()).filter(Boolean);
    const entry: BulkEntry = {};
    for (const parte of partes) {
      if (!entry.email && parte.includes('@')) entry.email = parte.toLowerCase();
      else if (!entry.phone && /^\+?[\d\s()-]{8,}$/.test(parte)) entry.phone = parte;
      else if (!entry.name) entry.name = parte;
    }

    if (!entry.email && !entry.phone) {
      skipped.push({ line: i + 1, reason: 'sem e-mail nem telefone', raw: texto });
      return;
    }
    entries.push(entry);
  });

  return { entries, skipped };
}

/**
 * Cria/actualiza os alunos e concede os acessos.
 *
 * As credenciais NÃO saem daqui: cada aluno entra numa fila persistida
 * (credentialDelivery.service), que entrega por e-mail primeiro e só recorre
 * ao WhatsApp quando a quota diária de e-mail acaba. O endpoint responde
 * assim que as contas existem.
 */
export async function bulkEnroll(args: {
  entries: BulkEntry[];
  /** Dias de acesso à plataforma inteira. 0 = nenhum (só o curso). */
  platformDays: number;
  /** Curso concedido — vitalício por omissão. */
  courseId?: string | null;
  courseExpiresAt?: Date | null;
  /** Código do coprodutor a vincular (comissões futuras + link de renovação). */
  coproducerCode?: string | null;
  grantedById?: string | null;
  /** Rótulo da leva, para o admin identificar a origem na fila. */
  batch?: string | null;
  /** Origem gravada no CourseAccess. 'import' (default histórico) ou
   *  'coproducer' quando quem matricula é o coprodutor do curso. */
  courseSource?: string | null;
}): Promise<BulkResult> {
  const result: BulkResult = { total: args.entries.length, created: 0, reused: 0, skipped: [] };

  // `includedTools` nulo = tudo incluído (comportamento histórico dos cursos
  // que já existiam). Lista presente = só o que estiver lá dentro.
  let incluiKomunika = true;
  let courseName: string | undefined;
  if (args.courseId) {
    const curso = await prisma.course.findUnique({
      where: { id: args.courseId },
      select: { includedTools: true, name: true },
    });
    courseName = curso?.name;
    const tools = curso?.includedTools as unknown;
    if (Array.isArray(tools)) incluiKomunika = tools.map(String).includes('komunika');
  }
  const agora = new Date();
  const fim = args.platformDays > 0
    ? new Date(agora.getTime() + args.platformDays * 24 * 60 * 60 * 1000)
    : null;

  const paraEnviar: Array<{ userId: string }> = [];

  for (let i = 0; i < args.entries.length; i++) {
    const entry = args.entries[i];
    try {
      const email = (entry.email || '').toLowerCase().trim();
      const phone = entry.phone ? normalizeMzPhone(entry.phone) : '';
      const nome = entry.name?.trim() || 'Aluno';

      const existente = await prisma.user.findFirst({
        where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
      });

      const { raw, hash } = await generateUserPassword();

      const base: Record<string, unknown> = {
        role: 'member',
        isActive: true,
        passwordHash: hash,
        remarketingStage: 'none',
        // Cortesia/turma: fica fora do MRR, como qualquer acesso concedido.
        grantedManually: true,
        ...(fim
          ? { subscriptionStatus: 'active', subscriptionStart: agora, subscriptionEnd: fim }
          : {}),
      };

      let user;
      if (existente) {
        user = await prisma.user.update({
          where: { id: existente.id },
          data: {
            ...base,
            name: entry.name?.trim() || existente.name,
            // Não re-atribui quem já veio por outro parceiro.
            ...(args.coproducerCode && !existente.referredByCoproducer
              ? { referredByCoproducer: args.coproducerCode }
              : {}),
            ...(existente.lojouOrderId ? {} : { lojouOrderId: `TURMA_${existente.id.slice(0, 8)}` }),
          },
        });
        result.reused++;
      } else {
        user = await prisma.user.create({
          data: {
            ...base,
            name: nome,
            email: email || `turma_${randomUUID().slice(0, 8)}@lead.czero.sbs`,
            phone: phone || `turma_${randomUUID().slice(0, 8)}`,
            ...(args.coproducerCode ? { referredByCoproducer: args.coproducerCode } : {}),
            lojouOrderId: `TURMA_${randomUUID().slice(0, 8)}`,
          } as any,
        });
        result.created++;
      }

      if (args.courseId) {
        await grantCourseAccess({
          userId: user.id,
          courseId: args.courseId,
          source: args.courseSource || 'import',
          expiresAt: args.courseExpiresAt ?? null,
          grantedById: args.grantedById ?? null,
        });
      }

      // Komunika só se o curso da turma o incluir. Uma turma que comprou
      // apenas o curso (COD) não ganha a ferramenta — para a ter, assina o
      // Código Zero à parte, e aí o fluxo normal provisiona.
      if (fim && incluiKomunika) {
        void syncKomunikaOnApprovedOrder(user.id).catch((e) =>
          console.error('[TURMA] komunika falhou:', e?.message || e),
        );
      }
      void scheduleSaveContactReminder(user.id).catch(() => {});

      paraEnviar.push({ userId: user.id });
    } catch (err: any) {
      result.skipped.push({
        line: i + 1,
        reason: err?.message || 'erro ao criar',
        raw: entry.email || entry.phone || '',
      });
    }
  }

  // Entrega assíncrona e persistida: e-mail primeiro, WhatsApp só quando a
  // quota do dia acaba (ver credentialDelivery.service). A senha de cada um é
  // gerada no momento do envio, não aqui — por isso não guardamos nada.
  for (const p of paraEnviar) {
    await enqueueCredentialDelivery(p.userId, args.batch || 'turma', courseName);
  }
  console.log(`[TURMA] ${paraEnviar.length} aluno(s) na fila de entrega`);

  return result;
}
