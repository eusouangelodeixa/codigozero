import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { scarcityMiddleware } from '../middlewares/scarcity.middleware';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/webhooks/lojou
 * Receives payment events from Lojou gateway.
 * Events: order.approved, order.refunded, order.cancelled
 */
router.post('/lojou', scarcityMiddleware, async (req: Request, res: Response) => {
  try {
    // Verify webhook secret
    const webhookSecret = req.headers['x-lojou-webhook-secret'];
    if (env.LOJOU_WEBHOOK_SECRET && webhookSecret !== env.LOJOU_WEBHOOK_SECRET) {
      console.warn('[WEBHOOK] Invalid webhook secret received');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse body (may be raw buffer from express.raw())
    let payload: any;
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString());
    } else {
      payload = req.body;
    }

    const { event, data } = payload;
    console.log(`[WEBHOOK] Received event: ${event}`, JSON.stringify(data, null, 2));

    if (!event || !data) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const orderId = data.id || data.order_id;

    // Deduplication: check if we already processed this order
    const existingTransaction = await prisma.transaction.findUnique({
      where: { orderId: String(orderId) },
    });

    if (existingTransaction && existingTransaction.status === 'approved') {
      console.log(`[WEBHOOK] Order ${orderId} already processed, skipping`);
      return res.json({ status: 'already_processed' });
    }

    switch (event) {
      case 'order.approved': {
        const customerEmail = data.customer?.email;
        const customerPhone = data.customer?.phone || data.customer?.cellphone;
        const customerName = data.customer?.name || 'Membro CZ';
        const amount = data.amount || data.total || 797;

        // Generate random password
        const rawPassword = uuidv4().slice(0, 8);
        const passwordHash = await bcrypt.hash(rawPassword, 10);

        // Create or reactivate user
        let user = await prisma.user.findFirst({
          where: {
            OR: [
              ...(customerEmail ? [{ email: customerEmail }] : []),
              ...(customerPhone ? [{ phone: customerPhone }] : []),
            ],
          },
        });

        if (user) {
          // Reactivate existing user
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              isActive: true,
              subscriptionStatus: 'active',
              subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 days
              lojouOrderId: String(orderId),
              passwordHash, // Reset password on reactivation
            },
          });
        } else {
          // Create new user
          user = await prisma.user.create({
            data: {
              name: customerName,
              email: customerEmail || `user_${Date.now()}@codigozero.app`,
              phone: customerPhone || `+258${Date.now().toString().slice(-9)}`,
              passwordHash,
              subscriptionStatus: 'active',
              subscriptionEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
              lojouOrderId: String(orderId),
            },
          });

          // Increment user count
          await prisma.systemConfig.upsert({
            where: { id: 'singleton' },
            update: { currentUsers: { increment: 1 } },
            create: { id: 'singleton', currentUsers: 1, maxUsers: 50 },
          });
        }

        // Record transaction
        await prisma.transaction.upsert({
          where: { orderId: String(orderId) },
          update: { status: 'approved', metadata: data },
          create: {
            orderId: String(orderId),
            userEmail: customerEmail,
            userPhone: customerPhone,
            userName: customerName,
            amount,
            status: 'approved',
            paymentMethod: data.payment_method || 'mpesa',
            metadata: data,
          },
        });

        console.log(`[WEBHOOK] ✅ User created/reactivated: ${user.email}`);
        console.log(`[WEBHOOK] 🔑 Credentials — Email: ${user.email} | Password: ${rawPassword}`);

        // TODO: Send credentials via WhatsApp
        // await sendWhatsApp(customerPhone, `Bem-vindo ao Código Zero!\nEmail: ${user.email}\nSenha: ${rawPassword}`);

        return res.json({ status: 'user_created', userId: user.id });
      }

      case 'order.refunded': {
        // Find user by order and deactivate
        if (existingTransaction) {
          const user = await prisma.user.findFirst({
            where: {
              OR: [
                ...(existingTransaction.userEmail ? [{ email: existingTransaction.userEmail }] : []),
                ...(existingTransaction.userPhone ? [{ phone: existingTransaction.userPhone }] : []),
              ],
            },
          });

          if (user) {
            await prisma.user.update({
              where: { id: user.id },
              data: { subscriptionStatus: 'canceled', isActive: false },
            });

            await prisma.systemConfig.update({
              where: { id: 'singleton' },
              data: { currentUsers: { decrement: 1 } },
            });
          }

          await prisma.transaction.update({
            where: { orderId: String(orderId) },
            data: { status: 'refunded', metadata: data },
          });
        }

        console.log(`[WEBHOOK] 🔄 Order refunded: ${orderId}`);
        return res.json({ status: 'refund_processed' });
      }

      case 'order.cancelled': {
        if (existingTransaction) {
          await prisma.transaction.update({
            where: { orderId: String(orderId) },
            data: { status: 'failed', metadata: data },
          });
        }

        console.log(`[WEBHOOK] ❌ Order cancelled: ${orderId}`);
        return res.json({ status: 'cancellation_noted' });
      }

      default:
        console.log(`[WEBHOOK] Unknown event: ${event}`);
        return res.json({ status: 'event_ignored' });
    }
  } catch (error) {
    console.error('[WEBHOOK] Processing error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
