import { PrismaClient } from '@prisma/client';
import { grantCourseAccess } from './courseAccess.service';
import { normalizeMzPhone } from '../lib/whatsapp';
import { computeFees } from '../lib/fees';
import {
  generateUserPassword,
  sendCredentialsEmail,
  sendCredentialsViaWhatsApp,
  sendPurchaseConfirmation,
} from './payment.service';
import { sendPushToSuperAdmins } from './push.service';
import { logAdminEvent } from './adminEvents.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Extrai o pid do produto nos formatos que a Lojou usa. */
export function lojouPayloadPid(data: any): string {
  return str(data?.product?.product_pid) || str(data?.product?.pid) || str(data?.product_pid);
}

/** URL pública da área de membros para um curso. */
export function courseAccessUrl(slug: string): string {
  return `${process.env.MEMBERS_URL || 'https://members.czero.sbs'}/${slug}`;
}

export interface CourseSaleInput {
  course: { id: string; name: string; slug: string; coproducerId?: string | null };
  /** Payload Lojou (formato flat) do pedido aprovado. */
  data: any;
  orderId: string | null;
}

/**
 * Processa uma venda de CURSO avulso, venha ela do webhook por curso
 * (/api/webhooks/course/:token) ou do roteamento por pid no webhook principal.
 *
 * O que faz: garante a conta, concede o acesso vitalício, REGISTRA A
 * TRANSACTION (antes disto a venda de curso era invisível no faturamento),
 * entrega o acesso citando o nome do curso, e avisa os superadmins (push +
 * feed de atividade).
 *
 * O que NÃO faz, de propósito: não mexe em assinatura, não provisiona
 * Komunika além do includedTools do fluxo normal, e NUNCA entra no rateio de
 * sócios nem no crédito de afiliados — comprar um curso não é assinar a
 * plataforma. A exclusão dos sócios é estrutural: o creditPartnersForOrder
 * vive no caminho do produto principal e este código nunca o chama.
 */
export async function processCourseSale(input: CourseSaleInput): Promise<{
  userId: string;
  created: boolean;
}> {
  const { course, data } = input;
  const orderId = input.orderId ? String(input.orderId) : null;

  const email = str(data?.customer?.email).toLowerCase();
  const rawPhone =
    str(data?.customer?.mobile_number) || str(data?.customer?.phone) || str(data?.customer?.cellphone);
  const name = str(data?.customer?.name) || 'Aluno';
  if (!email && !rawPhone) {
    throw new Error('sem e-mail nem telefone do comprador');
  }
  const phone = rawPhone ? normalizeMzPhone(rawPhone) : '';

  // Conta: reaproveita por e-mail ou telefone (o comprador pode já ser
  // assinante — nesse caso ganha só o direito ao curso, sem tocar no resto).
  let user = await prisma.user.findFirst({
    where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
  });

  let rawPassword: string | null = null;
  if (!user) {
    const gen = await generateUserPassword();
    rawPassword = gen.raw;
    user = await prisma.user.create({
      data: {
        name,
        email: email || `curso_${Date.now()}@lead.czero.sbs`,
        phone: phone || `sem_telefone_${Date.now()}`,
        passwordHash: gen.hash,
        // Sem assinatura de propósito: ele comprou um curso, não o plano.
        // O login deixa-o entrar por causa do CourseAccess (auth.routes.ts).
        subscriptionStatus: 'lead',
        isActive: true,
      },
    });
  }

  await grantCourseAccess({
    userId: user.id,
    courseId: course.id,
    source: 'purchase',
    expiresAt: null, // compra de curso é vitalícia
    orderId,
  });

  // ── Transaction: a venda de curso entra no faturamento do admin ────────
  // amount vem de data.amount (data.product.price é o preço de TABELA da
  // Lojou, desatualizado e cego a cupom — já quebrou o financeiro uma vez).
  // O coproducerFee aqui é INFORMATIVO (o acerto da coprodução é por fora).
  if (orderId) {
    try {
      const copro = course.coproducerId
        ? await prisma.coproducerAccount.findUnique({
            where: { id: course.coproducerId },
            select: { id: true, sharePct: true },
          })
        : null;
      const amount = parseFloat(String(data?.amount || data?.total || 0)) || 0;
      const fees = computeFees({
        principalPrice: amount,
        bumpPrice: 0,
        coproducerSharePct: copro?.sharePct ?? 0,
      });
      const identity = {
        userEmail: user.email,
        userPhone: user.phone,
        userName: user.name,
        amount,
        currency: str(data?.currency) || 'MZN',
        status: 'approved',
        paymentMethod: str(data?.payment_method) || null,
        metadata: data,
        grossAmount: fees.grossAmount,
        lojouFee: fees.lojouFee,
        coproducerFee: fees.coproducerFee,
        netAmount: fees.netAmount,
        coproducerId: copro?.id ?? null,
        productPid: lojouPayloadPid(data) || null,
        productName: str(data?.product?.name) || course.name,
        courseId: course.id,
        gateway: 'lojou',
      };
      await prisma.transaction.upsert({
        where: { orderId },
        create: { orderId, ...identity },
        update: identity,
      });
    } catch (e: any) {
      console.error('[CURSO-VENDA] transaction falhou (não-bloqueante):', e?.message || e);
    }
  }

  // ── Entrega do acesso, sempre citando o curso comprado ────────────────
  const accessUrl = courseAccessUrl(course.slug);
  if (rawPassword) {
    void sendCredentialsEmail({
      name: user.name,
      email: user.email,
      rawPassword,
      productName: course.name,
    }).catch((e) => console.error('[CURSO-VENDA] e-mail falhou:', e?.message || e));
    if (phone) {
      void sendCredentialsViaWhatsApp({
        phone,
        email: user.email,
        rawPassword,
        productName: course.name,
        accessUrl,
      }).catch((e) => console.error('[CURSO-VENDA] whatsapp falhou:', e?.message || e));
    }
  } else {
    // Conta já existia: confirma a compra e diz onde acessar — sem tocar na
    // senha da pessoa.
    void sendPurchaseConfirmation({
      name: user.name,
      email: user.email,
      phone: phone || (user.phone?.startsWith('sem_telefone') ? null : user.phone),
      productName: course.name,
      accessUrl,
    });
  }

  console.log(`[CURSO-VENDA] ✅ "${course.name}" libertado para ${user.email} (pedido ${orderId || 'n/d'})`);
  void sendPushToSuperAdmins({
    title: '🎓 Venda de curso',
    body: `${user.name} comprou "${course.name}"`,
    url: '/admin/cursos',
  });
  void logAdminEvent({
    type: 'course_sale',
    title: `Venda: ${course.name}`,
    body: `${user.name} (${user.email}) comprou "${course.name}"${orderId ? ` — pedido ${orderId}` : ''}`,
    meta: { courseId: course.id, userId: user.id, orderId },
  });

  return { userId: user.id, created: !!rawPassword };
}
