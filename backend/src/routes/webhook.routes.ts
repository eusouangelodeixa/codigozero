import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { sendPushToSuperAdmins } from './auth.routes';

const router = Router();
const prisma = new PrismaClient();

/**
 * POST /api/webhooks/lojou
 * Receives payment events from Lojou gateway.
 * Events: order.approved, order.refunded, order.cancelled
 */
router.post('/lojou', async (req: Request, res: Response) => {
  try {
    // ── SECURITY LAYER 1: Webhook Secret (via header OR query param) ──
    const webhookSecret = req.headers['x-lojou-webhook-secret'] || req.query.secret;
    if (!env.LOJOU_WEBHOOK_SECRET || webhookSecret !== env.LOJOU_WEBHOOK_SECRET) {
      console.warn('[WEBHOOK] 🚨 REJECTED — invalid or missing webhook secret');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse body (may be raw buffer from express.raw())
    let payload: any;
    if (Buffer.isBuffer(req.body)) {
      payload = JSON.parse(req.body.toString());
    } else {
      payload = req.body;
    }

    // Lojou sends { order_type, customer, product, ... } at root level
    // Normalize: support both { event, data } and flat Lojou format
    let event: string;
    let data: any;
    if (payload.order_type) {
      // Lojou flat format: order_type at root, everything else is data
      event = payload.order_type.replace('order_', 'order.');
      data = payload;
    } else {
      event = payload.event;
      data = payload.data;
    }
    console.log(`[WEBHOOK] Received event: ${event}`, JSON.stringify(data, null, 2));

    if (!event || !data) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const orderId = data.order_number || data.id || data.order_id || data.transaction_id;

    // ── SECURITY LAYER 2: Verified Callback ──
    // Confirm the order really exists and has the claimed status at Lojou
    if (orderId && env.LOJOU_API_KEY) {
      try {
        const verifyRes = await fetch(`${env.LOJOU_API_URL}/v1/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${env.LOJOU_API_KEY}` },
        });
        if (verifyRes.ok) {
          const verifiedOrder = await verifyRes.json();
          const realStatus = verifiedOrder?.data?.status || verifiedOrder?.status;
          console.log(`[WEBHOOK] ✅ Verified order ${orderId} at Lojou — status: ${realStatus}`);

          // If Lojou says pending but webhook says approved, reject
          if (event === 'order.approved' && realStatus && realStatus !== 'approved') {
            console.warn(`[WEBHOOK] 🚨 MISMATCH — webhook says approved but Lojou says ${realStatus}`);
            return res.status(403).json({ error: 'Order status mismatch' });
          }
        } else {
          console.warn(`[WEBHOOK] ⚠️ Could not verify order ${orderId} at Lojou (status ${verifyRes.status})`);
        }
      } catch (verifyErr) {
        console.warn('[WEBHOOK] ⚠️ Verification call failed (non-blocking):', verifyErr);
        // Continue processing — don't block if Lojou is temporarily down
      }
    }

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
        const customerPhone = data.customer?.phone || data.customer?.cellphone || data.customer?.mobile_number;
        const customerName = data.customer?.name || 'Membro CZ';
        const amount = parseFloat(String(data.amount || data.total || data.product?.price || 797));
        const productName = data.product?.name || 'Código Zero';
        const currency = data.currency || 'MZN';
        const paymentMethod = data.payment_method || 'mpesa';

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

        const subscriber = data.plan_subscriber || {};
        const subscriptionStart = subscriber.start_date ? new Date(subscriber.start_date) : new Date();
        const subscriptionEnd = subscriber.end_date ? new Date(subscriber.end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        if (user) {
          // Reactivate existing user
          user = await prisma.user.update({
            where: { id: user.id },
            data: {
              isActive: true,
              subscriptionStatus: 'active',
              subscriptionStart,
              subscriptionEnd,
              lojouOrderId: String(orderId),
              passwordHash, // Reset password on reactivation
              remarketingStage: 'none',
              paymentsSinceLastCoupon: { increment: 1 },
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
              subscriptionStart,
              subscriptionEnd,
              lojouOrderId: String(orderId),
              paymentsSinceLastCoupon: 1,
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

        // Send credentials via WhatsApp (Komunika)
        if (customerPhone) {
          try {
            let cleanPhone = customerPhone.replace(/\D/g, '');
            if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
              cleanPhone = `258${cleanPhone}`;
            }

            const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
            const komunikaKey = sysConfig?.komunikaAdminApiKey || env.KOMUNIKA_ADMIN_API_KEY;
            const komunikaUrl = env.KOMUNIKA_API_URL || 'https://api.komunika.site';

            if (komunikaKey) {
              const credentialMsg = [
                `🎉 *Bem-vindo ao Código Zero!*`,
                ``,
                `Sua conta foi criada com sucesso.`,
                ``,
                `📧 *Email:* ${user.email}`,
                `🔑 *Senha:* ${rawPassword}`,
                ``,
                `🔗 *Acesse:* ${env.FRONTEND_URL}/login`,
                ``,
                `Guarde essas informações em local seguro. 💬`,
              ].join('\n');

              const instanceId = sysConfig?.komunikaInstanceId;
              if (instanceId) {
                await fetch(`${komunikaUrl}/api/v1/messages/send`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-API-Key': komunikaKey },
                  body: JSON.stringify({ instanceId, to: cleanPhone, type: 'text', content: credentialMsg }),
                });
              }

              console.log(`[WEBHOOK] 📱 Credentials sent via WhatsApp to ${cleanPhone}`);
            } else {
              console.warn(`[WEBHOOK] ⚠️ Komunika not configured — credentials NOT sent via WhatsApp`);
            }
          } catch (whatsappErr) {
            console.error(`[WEBHOOK] ⚠️ WhatsApp delivery failed (non-blocking):`, whatsappErr);
          }
        }

        // 🔔 Push notification to superadmin: NEW SALE
        const payMethodLabel = paymentMethod === 'mpesa' ? 'M-Pesa' : paymentMethod === 'emola' ? 'E-Mola' : paymentMethod;
        const amountFmt = new Intl.NumberFormat('pt-MZ', { minimumFractionDigits: 0 }).format(amount);
        sendPushToSuperAdmins({
          title: '💰 Nova Venda!',
          body: `${customerName} — ${productName}\n${amountFmt} ${currency} via ${payMethodLabel}`,
          url: '/admin/finance',
        }).catch(() => {});

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

          // 🔔 Push notification to superadmin: REFUND
          sendPushToSuperAdmins({
            title: '🔄 Reembolso',
            body: `Pedido ${orderId} foi reembolsado${user ? ` — ${user.name}` : ''}`,
            url: '/admin/finance',
          }).catch(() => {});
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

        // Integração Komunika: Remarketing de Abandono/Cancelamento
        const customerEmail = data.customer?.email;
        const customerPhone = data.customer?.phone || data.customer?.cellphone;
        const customerName = data.customer?.name || 'Visitante';

        // Tentar encontrar o usuário para ver se já recebeu o funil de falha
        let user = null;
        if (customerEmail || customerPhone || orderId) {
           user = await prisma.user.findFirst({
             where: {
               OR: [
                 ...(customerEmail ? [{ email: customerEmail }] : []),
                 ...(customerPhone ? [{ phone: customerPhone }] : []),
                 { lojouOrderId: String(orderId) }
               ],
             },
           });
        }
        
        const systemConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
        const checkoutFunnelId = systemConfig?.komunikaCheckoutFunnelId || env.KOMUNIKA_FUNNEL_CHECKOUT_ID;

        // Delay strategy: Just mark as 'checkout_pending'. The Cron Job handles the rest.
        if (customerPhone && env.KOMUNIKA_ADMIN_API_KEY && checkoutFunnelId) {
          if (user && user.subscriptionStatus === 'active') {
             return res.json({ status: 'ignored_active_user' });
          }

          if (user && user.remarketingStage === 'checkout_failed_sent') {
             return res.json({ status: 'ignored_spam' });
          }

          try {
            if (user) {
              await prisma.user.update({
                where: { id: user.id },
                data: { remarketingStage: 'checkout_pending' }
              });
            } else if (customerEmail) {
              // Create anonymous lead to track delayed checkout
              let cleanPhone = customerPhone.replace(/\D/g, '');
              if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
                cleanPhone = `258${cleanPhone}`;
              }
              const { v4: uuidv4 } = require('uuid');
              await prisma.user.create({
                data: {
                  email: customerEmail,
                  phone: cleanPhone,
                  name: customerName,
                  passwordHash: uuidv4(),
                  subscriptionStatus: 'lead',
                  lojouOrderId: String(orderId),
                  checkoutUrl: data.checkout_url || '',
                  remarketingStage: 'checkout_pending'
                }
              });
            }
          } catch (e) {
            console.error(`[WEBHOOK] Failed to mark user as checkout_pending:`, e);
          }
        }

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
