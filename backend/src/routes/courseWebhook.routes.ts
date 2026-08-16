import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { processCourseSale, processCourseRefund, lojouPayloadPid } from '../services/courseSale.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);
const router = Router();

/**
 * Webhook de VENDA DE UM CURSO avulso — uma rota por curso.
 *
 * Porque não se reaproveita o webhook principal: aquele historicamente não
 * validava produto nenhum (hoje valida e ROTEIA por pid — ver
 * webhook.routes.ts —, mas esta rota continua a ser o caminho recomendado por
 * ter a dupla tranca: token opaco na URL + pid do curso).
 *
 * O processamento em si (conta, acesso vitalício, Transaction no faturamento,
 * credenciais citando o curso, push + feed pro admin) vive em
 * services/courseSale.service.ts, partilhado com o roteamento do webhook
 * principal. Nada aqui entra no rateio de sócios.
 */

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

router.post('/course/:token', async (req: Request, res: Response) => {
  try {
    const token = str(req.params.token);
    if (token.length < 20) return res.status(404).json({ error: 'not found' });

    const course = await prisma.course.findUnique({
      where: { webhookToken: token },
      select: { id: true, name: true, slug: true, productPid: true, coproducerId: true },
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

    const event = str(body?.event) || str(body?.type) || str(body?.order_type);
    const data = body?.data || body;
    // Mesmos fallbacks do webhook principal (data.order_number → id → order_id
    // → transaction_id) — o payload da Lojou é o mesmo dos produtos do CZ.
    const orderId = str(data?.order_number) || str(data?.id) || str(data?.order_id) || str(data?.transaction_id) || null;

    const isApproval = /approved|paid|completed/i.test(event);
    const isRefund = /refund|refunded|chargeback|reembols/i.test(event);
    const isCancel = /cancel/i.test(event);

    // Segunda tranca em TODOS os eventos: o produto tem de ser o do curso.
    const pid = lojouPayloadPid(data);
    if (course.productPid && pid && pid !== course.productPid) {
      console.warn(`[CURSO-WEBHOOK] pid ${pid} não é o de "${course.name}" (${course.productPid}) — ignorado`);
      return res.status(202).json({ status: 'ignored', reason: 'pid mismatch' });
    }

    // Reembolso / chargeback → remove o acesso ao curso.
    if (isRefund) {
      const r = await processCourseRefund({ course, data, orderId });
      return res.json({ status: 'refunded', revoked: r.revoked });
    }
    // Cancelamento de checkout (não chegou a pagar) → nada a fazer; só registra.
    if (isCancel) {
      console.log(`[CURSO-WEBHOOK] cancelamento de "${course.name}" (pedido ${orderId || 'n/d'}) — sem ação`);
      return res.json({ status: 'ignored', event });
    }
    // Só a aprovação libera acesso. Outros eventos: ignora.
    if (event && !isApproval) {
      return res.json({ status: 'ignored', event });
    }

    if (course.productPid && !pid) {
      console.warn(`[CURSO-WEBHOOK] payload sem pid para "${course.name}" — ignorado`);
      return res.status(202).json({ status: 'ignored', reason: 'no pid' });
    }

    const result = await processCourseSale({ course, data, orderId });
    return res.json({ status: 'ok', courseId: course.id, userId: result.userId, created: result.created });
  } catch (error: any) {
    if (/sem e-mail nem telefone/.test(String(error?.message))) {
      return res.status(400).json({ error: 'sem e-mail nem telefone do comprador' });
    }
    console.error('[CURSO-WEBHOOK] falhou:', error?.message || error);
    return res.status(500).json({ error: 'erro interno' });
  }
});

/** Token opaco para a rota do curso. */
export function newCourseWebhookToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export default router;
