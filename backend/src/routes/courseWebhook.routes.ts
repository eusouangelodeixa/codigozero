import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { grantCourseAccess } from '../services/courseAccess.service';
import { normalizeMzPhone } from '../lib/whatsapp';
import {
  generateUserPassword,
  sendCredentialsEmail,
  sendCredentialsViaWhatsApp,
} from '../services/payment.service';
import { sendPushToSuperAdmins } from '../services/push.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);
const router = Router();

/**
 * Webhook de VENDA DE UM CURSO avulso — uma rota por curso.
 *
 * Porque não se reaproveita o webhook principal: aquele **não valida produto
 * nenhum**. Qualquer venda aprovada que lá chegue com o segredo certo vira
 * assinatura completa do Código Zero (cria conta, provisiona Komunika, credita
 * afiliado e sócios). Apontar o produto de um curso para ele daria a plataforma
 * inteira a quem comprou só o curso.
 *
 * Aqui a autenticação é o token opaco na URL — mesmo padrão já usado para os
 * coprodutores — e há ainda uma segunda tranca: o `pid` do payload tem de
 * bater com o `productPid` configurado no curso. Sem isso, o webhook de um
 * curso barato libertaria um curso caro.
 *
 * O que esta rota faz é deliberadamente pouco: garante a conta e concede o
 * acesso ao curso. Não mexe em assinatura, não provisiona Komunika e não entra
 * no rateio de sócios — comprar um curso não é assinar a plataforma.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Extrai o pid do produto nos formatos que a Lojou usa. */
function payloadPid(data: any): string {
  return str(data?.product?.product_pid) || str(data?.product?.pid) || str(data?.product_pid);
}

router.post('/course/:token', async (req: Request, res: Response) => {
  try {
    const token = str(req.params.token);
    if (token.length < 20) return res.status(404).json({ error: 'not found' });

    const course = await prisma.course.findUnique({
      where: { webhookToken: token },
      select: { id: true, name: true, slug: true, productPid: true },
    });
    if (!course) return res.status(404).json({ error: 'not found' });

    // O corpo chega como Buffer (o mount de /api/webhooks usa express.raw).
    let body: any = req.body;
    if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(body.toString('utf8'));
      } catch {
        return res.status(400).json({ error: 'invalid json' });
      }
    }

    const event = str(body?.event) || str(body?.type);
    const data = body?.data || body;

    // Só a aprovação liberta. "Checkout iniciado" e cancelamento não são venda.
    if (event && !/approved|paid|completed/i.test(event)) {
      return res.json({ status: 'ignored', event });
    }

    // Segunda tranca: o produto tem de ser o do curso.
    const pid = payloadPid(data);
    if (course.productPid && pid && pid !== course.productPid) {
      console.warn(`[CURSO-WEBHOOK] pid ${pid} não é o de "${course.name}" (${course.productPid}) — ignorado`);
      return res.status(202).json({ status: 'ignored', reason: 'pid mismatch' });
    }
    if (course.productPid && !pid) {
      console.warn(`[CURSO-WEBHOOK] payload sem pid para "${course.name}" — ignorado`);
      return res.status(202).json({ status: 'ignored', reason: 'no pid' });
    }

    const email = str(data?.customer?.email).toLowerCase();
    const rawPhone = str(data?.customer?.mobile_number) || str(data?.customer?.phone) || str(data?.customer?.cellphone);
    const name = str(data?.customer?.name) || 'Aluno';
    const orderId = str(data?.order_number) || str(data?.id) || null;
    if (!email && !rawPhone) {
      return res.status(400).json({ error: 'sem e-mail nem telefone do comprador' });
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

    if (rawPassword) {
      void sendCredentialsEmail({ name: user.name, email: user.email, rawPassword }).catch((e) =>
        console.error('[CURSO-WEBHOOK] e-mail falhou:', e?.message || e),
      );
      if (phone) {
        void sendCredentialsViaWhatsApp({ phone, email: user.email, rawPassword }).catch((e) =>
          console.error('[CURSO-WEBHOOK] whatsapp falhou:', e?.message || e),
        );
      }
    }

    console.log(`[CURSO-WEBHOOK] ✅ "${course.name}" libertado para ${user.email} (pedido ${orderId || 'n/d'})`);
    void sendPushToSuperAdmins({
      title: '🎓 Venda de curso',
      body: `${user.name} comprou "${course.name}"`,
      url: '/admin/cursos',
    });

    return res.json({ status: 'ok', courseId: course.id, userId: user.id, created: !!rawPassword });
  } catch (error: any) {
    console.error('[CURSO-WEBHOOK] falhou:', error?.message || error);
    return res.status(500).json({ error: 'erro interno' });
  }
});

/** Token opaco para a rota do curso. */
export function newCourseWebhookToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export default router;
