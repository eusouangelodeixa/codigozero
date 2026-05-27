import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import { sendPushToSuperAdmins, sendPushToUser } from './auth.routes';
import {
  creditCommissionForOrder,
  refundCommissionForOrder,
} from '../services/affiliate.service';
import { detectOrderBump } from '../lib/orderBump';
import { getActivePrice } from '../lib/pricing';

const router = Router();
const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_SUBSCRIPTION_DAYS = 30;
const CLOSE_FRIENDS_EXTRA_DAYS = 60; // +2 months on top of the base month

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
    try {
      if (Buffer.isBuffer(req.body)) {
        const bodyStr = req.body.toString().trim();
        payload = bodyStr ? JSON.parse(bodyStr) : {};
      } else if (typeof req.body === 'string') {
        payload = req.body.trim() ? JSON.parse(req.body) : {};
      } else {
        payload = req.body || {};
      }
    } catch (err) {
      console.warn('[WEBHOOK] 🚨 JSON Parse failed:', err);
      return res.status(400).json({ error: 'Invalid JSON payload' });
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
    // Confirm the order really exists and has the claimed status at Lojou (unless it's a test)
    const isTestOrder = String(orderId).toUpperCase().startsWith('TEST');
    if (orderId && env.LOJOU_API_KEY && !isTestOrder) {
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
        } else if (verifyRes.status === 404) {
          console.warn(`[WEBHOOK] 🚨 FAKE ORDER — order ${orderId} does not exist at Lojou`);
          return res.status(403).json({ error: 'Order not found at gateway' });
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
        const totalAmount = parseFloat(
          String(
            data.amount ||
              data.total ||
              data.product?.price ||
              (await getActivePrice()),
          ),
        );
        const productName = data.product?.name || 'Código Zero';
        const currency = data.currency || 'MZN';
        const paymentMethod = data.payment_method || 'mpesa';

        // ── Close Friends order bump ─────────────────────────────────────
        // Primary detection: scan the Lojou payload for the configured pid.
        //
        // Fallback: when a product has coproducer splits enabled, Lojou
        // strips order_bump[] to an empty array even when the buyer took
        // the bump (the gateway shows the seller-net amount instead of
        // declaring the line items). To recover, we infer the bump from
        // the net amount — if it's materially higher than the principal
        // alone could ever produce, the bump was bought.
        //
        // Heuristic: principal-only net is capped by `principalPrice` (no
        // upsell can come from below). A net amount > principalPrice ×
        // BUMP_AMOUNT_THRESHOLD means an upsell was attached. Default
        // ratio is 1.5, configurable via LOJOU_BUMP_DETECT_RATIO.
        let bumpMatch = env.LOJOU_CLOSE_FRIENDS_PID
          ? detectOrderBump(data, env.LOJOU_CLOSE_FRIENDS_PID)
          : null;

        const activePrincipal = await getActivePrice();
        const ratio = parseFloat(process.env.LOJOU_BUMP_DETECT_RATIO || '1.5');
        const bumpInferredByAmount =
          !bumpMatch &&
          env.LOJOU_CLOSE_FRIENDS_PID &&
          activePrincipal > 0 &&
          totalAmount > activePrincipal * ratio;

        if (bumpInferredByAmount) {
          bumpMatch = {
            pid: env.LOJOU_CLOSE_FRIENDS_PID,
            // Gateway didn't tell us the bump line — use the configured
            // gross price as the canonical value for audit.
            amount: parseFloat(process.env.LOJOU_CLOSE_FRIENDS_PRICE || '1297'),
            matchedAt: `inferred:amount>${(activePrincipal * ratio).toFixed(2)}`,
          };
          console.log(
            `[WEBHOOK] 🥂 Close Friends inferred from amount (net=${totalAmount}, principal=${activePrincipal}, ratio>${ratio})`,
          );
        } else if (bumpMatch) {
          console.log(
            `[WEBHOOK] 🥂 Close Friends bump detected at ${bumpMatch.matchedAt} (amount=${bumpMatch.amount})`,
          );
        }
        const isCloseFriends = !!bumpMatch;
        const bumpAmount = bumpMatch?.amount || 0;
        // Prefer the explicit principal product price from the payload
        // (data.product.price comes as a string in the Lojou format), with
        // total-minus-bump as fallback. This keeps the affiliate commission
        // honest even when the bump amount can't be parsed.
        const productPriceFromPayload = parseFloat(String(data.product?.price || 0));
        const principalAmount =
          productPriceFromPayload > 0
            ? productPriceFromPayload
            : bumpAmount > 0
              ? Math.max(0, totalAmount - bumpAmount)
              : totalAmount;

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

        // Lojou occasionally sends an explicit end_date; honor it. Otherwise
        // compute it from base + close-friends extra. Renewals don't compound
        // the bonus — each payment that includes the bump grants the full
        // 3-month window starting "now".
        const totalDays = BASE_SUBSCRIPTION_DAYS + (isCloseFriends ? CLOSE_FRIENDS_EXTRA_DAYS : 0);
        const subscriptionEnd = subscriber.end_date
          ? new Date(subscriber.end_date)
          : new Date(Date.now() + totalDays * DAY_MS);

        const closeFriendsUntil = isCloseFriends ? subscriptionEnd : null;

        if (user) {
          // Reactivate existing user. If this is a renewal *without* the
          // bump and they used to be Close Friends, the absence is a
          // deliberate downgrade — we drop the flag.
          const wasCloseFriends = user.closeFriends;
          if (wasCloseFriends && !isCloseFriends) {
            console.log(`[WEBHOOK] ⬇️ Close Friends downgrade for ${user.email} (renewed without bump)`);
          }
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
              closeFriends: isCloseFriends,
              closeFriendsUntil,
              ...(isCloseFriends ? { closeFriendsPurchaseCount: { increment: 1 } } : {}),
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
              closeFriends: isCloseFriends,
              closeFriendsUntil,
              closeFriendsPurchaseCount: isCloseFriends ? 1 : 0,
            },
          });

          // Increment user count
          await prisma.systemConfig.upsert({
            where: { id: 'singleton' },
            update: { currentUsers: { increment: 1 } },
            create: { id: 'singleton', currentUsers: 1, maxUsers: 50 },
          });
        }

        // Record transaction. `amount` is always the gross total (principal +
        // bump) so existing faturamento/MRR queries keep working. The bump
        // breakdown is stored separately for audit.
        await prisma.transaction.upsert({
          where: { orderId: String(orderId) },
          update: {
            status: 'approved',
            metadata: data,
            orderBumpPid: bumpMatch?.pid ?? null,
            orderBumpAmount: bumpAmount || null,
            isCloseFriends,
          },
          create: {
            orderId: String(orderId),
            userEmail: customerEmail,
            userPhone: customerPhone,
            userName: customerName,
            amount: totalAmount,
            status: 'approved',
            paymentMethod: data.payment_method || 'mpesa',
            metadata: data,
            orderBumpPid: bumpMatch?.pid ?? null,
            orderBumpAmount: bumpAmount || null,
            isCloseFriends,
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
        const amountFmt = new Intl.NumberFormat('pt-MZ', { minimumFractionDigits: 0 }).format(totalAmount);
        const bumpLabel = isCloseFriends ? ' 🥂 Close Friends' : '';
        sendPushToSuperAdmins({
          title: '💰 Nova Venda!',
          body: `${customerName} — ${productName}${bumpLabel}\n${amountFmt} ${currency} via ${payMethodLabel}`,
          url: '/admin/finance',
        }).catch(() => {});

        // ── Affiliate commission credit ────────────────────────────────
        // Sales recovered via remarketing belong to the system per the
        // program rules; pre-remarketing sales attributed to an affiliate
        // get a commission row. Commission is calculated on the principal
        // only — the Close Friends order bump is an upsell that doesn't
        // generate affiliate commission.
        try {
          if (user.referredByCode) {
            const credit = await creditCommissionForOrder({
              userId: user.id,
              affiliateCode: user.referredByCode,
              remarketingStage: user.remarketingStage,
              saleAmount: principalAmount,
              lojouOrderId: String(orderId),
            });
            if (credit.credited) {
              console.log(
                `[WEBHOOK] 🎉 Affiliate ${user.referredByCode} credited (commission=${credit.commissionId})`,
              );
              // Notify the affiliate they got a new sale
              const affAccount = await prisma.affiliateAccount.findFirst({
                where: { id: credit.affiliateId },
                include: { user: { select: { id: true } } },
              });
              if (affAccount) {
                sendPushToUser(affAccount.user.id, {
                  title: '🎉 Nova venda pelo seu link!',
                  body: 'Comissão lançada — disponível para saque em 7 dias.',
                  url: '/afiliacao',
                }).catch(() => {});
              }
            } else {
              console.log(`[WEBHOOK] Affiliate credit skipped: ${credit.skipped}`);
            }
          }
        } catch (affErr) {
          console.error('[WEBHOOK] Affiliate commission error (non-blocking):', affErr);
        }

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
              data: {
                subscriptionStatus: 'canceled',
                isActive: false,
                // Refund implicitly invalidates the Close Friends grant tied
                // to this order. Cancellation drops the badge regardless of
                // whether the refunded order carried the bump.
                closeFriends: false,
                closeFriendsUntil: null,
              },
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

        // Reverse any affiliate commission tied to this order
        try {
          const reversed = await refundCommissionForOrder(String(orderId));
          if (reversed > 0) {
            console.log(`[WEBHOOK] ↩️ Reversed ${reversed} affiliate commission(s) for ${orderId}`);
          }
        } catch (affErr) {
          console.error('[WEBHOOK] Affiliate refund error (non-blocking):', affErr);
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
