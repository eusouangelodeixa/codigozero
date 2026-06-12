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
import {
  creditPartnersForOrder,
  reversePartnersForOrder,
} from '../services/partner.service';
import { detectOrderBump } from '../lib/orderBump';
import { getActivePrice } from '../lib/pricing';
import { resolveCoproducerForOrder, notifyCoproducer } from '../services/coproducer.service';
import { computeFees } from '../lib/fees';
import { isStripeConfigured, verifyStripeWebhook, retrieveCustomer } from '../services/stripe.service';
import { sendCancellationMessage } from '../services/lifecycle.service';
import {
  generateUserPassword,
  sendCredentialsViaWhatsApp,
  notifyAdminOfSale,
  reconcileManualStripe,
} from '../services/payment.service';
import {
  syncKomunikaOnApprovedOrder,
  updateKomunikaSubscription,
  deprovisionKomunika,
} from '../services/komunika.service';
import type Stripe from 'stripe';

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

        // ── Resolve coproducer attribution UP FRONT ──────────────────────
        // Done before bump detection because the coproducer may have its
        // own bump pid + price — we need both to pick which pid to scan
        // and which fallback price to record on audit.
        const preBuyerForCoproducer = await prisma.user.findFirst({
          where: {
            OR: [
              ...(customerEmail ? [{ email: customerEmail }] : []),
              ...(customerPhone ? [{ phone: customerPhone }] : []),
            ],
          },
          select: { referredByCoproducer: true },
        });
        const coproducer = await resolveCoproducerForOrder({
          productPid: data.product?.pid || null,
          buyerReferralCode: preBuyerForCoproducer?.referredByCoproducer || null,
        });
        if (coproducer) {
          console.log(`[WEBHOOK] 🤝 Attributed to coproducer ${coproducer.code} (id=${coproducer.id})`);
        }

        // ── Close Friends / bump detection ───────────────────────────────
        // The bump pid is the coproducer's own (when set) OR the principal
        // env. Same fallback price logic: coproducer.bumpPrice when set,
        // otherwise LOJOU_CLOSE_FRIENDS_PRICE (default 1297).
        const effectiveBumpPid = coproducer?.bumpProductPid || env.LOJOU_CLOSE_FRIENDS_PID;
        const effectiveBumpPrice = coproducer?.bumpPrice
          ?? parseFloat(process.env.LOJOU_CLOSE_FRIENDS_PRICE || '1297');

        // Primary detection: scan payload for that pid.
        let bumpMatch = effectiveBumpPid
          ? detectOrderBump(data, effectiveBumpPid)
          : null;

        // Fallback heuristic: when coproducer splits are on, Lojou strips
        // order_bump[] but the net amount still betrays the upsell.
        const activePrincipal = await getActivePrice();
        const ratio = parseFloat(process.env.LOJOU_BUMP_DETECT_RATIO || '1.5');
        const bumpInferredByAmount =
          !bumpMatch &&
          effectiveBumpPid &&
          activePrincipal > 0 &&
          totalAmount > activePrincipal * ratio;

        if (bumpInferredByAmount) {
          bumpMatch = {
            pid: effectiveBumpPid,
            amount: effectiveBumpPrice,
            matchedAt: `inferred:amount>${(activePrincipal * ratio).toFixed(2)}`,
          };
          console.log(
            `[WEBHOOK] 🥂 Bump inferred from amount (pid=${effectiveBumpPid}, net=${totalAmount}, principal=${activePrincipal}, ratio>${ratio})`,
          );
        } else if (bumpMatch) {
          console.log(
            `[WEBHOOK] 🥂 Bump detected at ${bumpMatch.matchedAt} (pid=${effectiveBumpPid}, amount=${bumpMatch.amount})`,
          );
        }
        const isCloseFriends = !!bumpMatch;
        const bumpAmount = bumpMatch?.amount || 0;

        // ── Secondary order bump (197 MZN upsell) ────────────────────────
        // Detected only to count items exactly for the Lojou fixed fee in the
        // partner revenue-share base. Its value is already inside totalAmount,
        // so it is split among the sócios either way. Does not extend access.
        const bump197 = env.LOJOU_BUMP_197_PID
          ? detectOrderBump(data, env.LOJOU_BUMP_197_PID)
          : null;
        if (bump197) {
          console.log(`[WEBHOOK] ➕ Bump 197 detected at ${bump197.matchedAt} (pid=${env.LOJOU_BUMP_197_PID})`);
        }
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

        // Create or reactivate user. A renewal/reactivation is when this
        // person ALREADY PAID before — NOT merely that a User row exists.
        // We create 'lead' User rows the moment a visitor submits the landing
        // form, so a first-time payer who was previously a captured lead must
        // NOT be counted as a renewal (that was the bug that mislabelled new
        // sales as renovações). The ground truth is a prior approved
        // Transaction for this email/phone (the current order's transaction
        // isn't created yet at this point, so it won't match itself).
        const preExisting = await prisma.user.findFirst({
          where: {
            OR: [
              ...(customerEmail ? [{ email: customerEmail }] : []),
              ...(customerPhone ? [{ phone: customerPhone }] : []),
            ],
          },
        });
        let isRenewal = false;
        if (preExisting) {
          const priorPaid = await prisma.transaction.findFirst({
            where: {
              status: 'approved',
              OR: [
                ...(customerEmail ? [{ userEmail: customerEmail }] : []),
                ...(customerPhone ? [{ userPhone: customerPhone }] : []),
              ],
            },
            select: { id: true },
          });
          isRenewal = !!priorPaid;
        }
        let user = preExisting;

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
        // (coproducer was already resolved at the top, before bump detection)
        // ── Gross + fee breakdown (audit) ───────────────────────────────
        // Reconstruct what Lojou kept, what coproducer kept, what we got.
        // principalPrice prefers the explicit product.price; falls back to
        // (totalAmount - bumpAmount) if missing. bumpPrice uses the
        // coproducer's bumpPrice when applicable.
        const fees = computeFees({
          principalPrice: principalAmount,
          bumpPrice: isCloseFriends ? (coproducer?.bumpPrice ?? bumpAmount) : 0,
          coproducerSharePct: coproducer?.sharePct ?? null,
        });

        // Idempotency probe for the coupon-usage increment below — we only
        // want to bump usesCount on the FIRST time this orderId is seen,
        // not on Lojou webhook re-deliveries.
        const txExistedBefore = await prisma.transaction.findUnique({
          where: { orderId: String(orderId) },
          select: { id: true },
        });

        await prisma.transaction.upsert({
          where: { orderId: String(orderId) },
          update: {
            status: 'approved',
            metadata: data,
            orderBumpPid: bumpMatch?.pid ?? null,
            orderBumpAmount: bumpAmount || null,
            isCloseFriends,
            isRenewal,
            coproducerId: coproducer?.id ?? null,
            grossAmount: fees.grossAmount,
            lojouFee: fees.lojouFee,
            coproducerFee: fees.coproducerFee,
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
            isRenewal,
            coproducerId: coproducer?.id ?? null,
            grossAmount: fees.grossAmount,
            lojouFee: fees.lojouFee,
            coproducerFee: fees.coproducerFee,
          },
        });

        // ── Coproducer push notification ─────────────────────────────────
        // Fire-and-forget; helper never throws. Skips when the coproducer
        // turned off the relevant toggle but still logs to NotificationLog.
        if (coproducer && !txExistedBefore) {
          const verb = isRenewal ? 'Renovação' : 'Nova venda';
          const cfTag = isCloseFriends ? ' ⭐CF' : '';
          notifyCoproducer({
            coproducerId: coproducer.id,
            type: isRenewal ? 'renewal' : 'sale',
            title: `💰 ${verb}${cfTag}`,
            body: `${customerName || customerEmail} — ${(totalAmount || 0).toFixed(0)} MZN`,
            url: '/coproducer/finance',
          }).catch(() => {});
        }

        // ── Coupon usage tracking ────────────────────────────────────────
        // Lojou puts the coupon code on the top-level webhook payload as
        // `coupon_code` (also surfaced as `discount_amount`/`original_amount`
        // on couponed orders). We only increment usesCount when this
        // orderId is being seen for the first time — Lojou re-delivers
        // webhooks on its own retry schedule, and a re-delivery should
        // not double-count the use.
        const couponCodeRaw = (data.coupon_code || data.coupon?.code || '').toString().trim();
        if (couponCodeRaw && !txExistedBefore) {
          try {
            const couponCode = couponCodeRaw.toUpperCase();
            const updated = await prisma.coupon.updateMany({
              where: { code: couponCode, active: true },
              data: { usesCount: { increment: 1 } },
            });
            if (updated.count > 0) {
              // Re-read to check whether the cap was hit and we should
              // disable the coupon (mirrors Lojou's own behavior).
              const c = await prisma.coupon.findUnique({ where: { code: couponCode } });
              if (c && c.usesCount >= c.maxUses) {
                await prisma.coupon.update({ where: { id: c.id }, data: { active: false } });
                console.log(`[WEBHOOK] 🎟️ Coupon ${couponCode} exhausted (${c.usesCount}/${c.maxUses}) → disabled`);
              } else if (c) {
                console.log(`[WEBHOOK] 🎟️ Coupon ${couponCode} used (${c.usesCount}/${c.maxUses})`);
              }
            } else {
              console.warn(`[WEBHOOK] 🎟️ Coupon ${couponCode} on order ${orderId} not found locally (or already inactive)`);
            }
          } catch (e: any) {
            console.error('[WEBHOOK] Coupon usage tracking failed (non-blocking):', e?.message || e);
          }
        }

        console.log(`[WEBHOOK] ✅ User created/reactivated: ${user.email}`);
        console.log(`[WEBHOOK] 🔑 Credentials — Email: ${user.email} | Password: ${rawPassword}`);

        // ── Komunika embedded module (provision + SSO) ───────────────────
        // Komunika is bundled free with the CZ subscription: provision (or, on
        // renewal, extend) the tenant for every approved order. Fire-and-forget
        // with internal retry so we don't block the webhook response. Skipped on
        // webhook re-delivery (txExistedBefore) — the sync is idempotent anyway,
        // but this avoids a redundant in-flight provision racing the first.
        if (!txExistedBefore) {
          syncKomunikaOnApprovedOrder(user.id).catch((e) =>
            console.error('[WEBHOOK] Komunika sync failed (non-blocking):', e?.message || e),
          );
        }

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
                // Send with retry + real status check. The previous
                // implementation logged "sent" unconditionally, masking
                // 401/429/500 from Komunika and giving false confidence
                // that customers had received their credentials.
                let delivered = false;
                let lastStatus: number | string = 'no-attempt';
                let lastBody = '';
                for (let attempt = 1; attempt <= 3; attempt++) {
                  try {
                    const res = await fetch(`${komunikaUrl}/api/v1/messages/send`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'X-API-Key': komunikaKey },
                      body: JSON.stringify({ instanceId, to: cleanPhone, type: 'text', content: credentialMsg }),
                    });
                    lastStatus = res.status;
                    lastBody = await res.text().catch(() => '');
                    if (res.ok) {
                      delivered = true;
                      console.log(`[WEBHOOK] ✅ Credentials delivered via WhatsApp to ${cleanPhone} (status=${res.status}, attempt=${attempt})`);
                      break;
                    }
                    console.warn(`[WEBHOOK] ⚠️ Komunika attempt ${attempt} failed: status=${res.status} body=${lastBody.slice(0, 200)}`);
                  } catch (e: any) {
                    lastStatus = `throw:${e?.message || 'unknown'}`;
                    console.warn(`[WEBHOOK] ⚠️ Komunika attempt ${attempt} threw:`, e?.message || e);
                  }
                  // Brief backoff between attempts
                  if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
                }
                if (!delivered) {
                  console.error(`[WEBHOOK] 🚨 CREDENTIALS NOT DELIVERED to ${cleanPhone} after 3 attempts. lastStatus=${lastStatus} body=${lastBody.slice(0, 200)}`);
                  // Notify superadmins so manual recovery (resend from admin) can happen
                  sendPushToSuperAdmins({
                    title: '🚨 Entrega de acesso falhou',
                    body: `${user.email} pagou mas não recebeu credenciais. Status Komunika: ${lastStatus}`,
                    url: '/admin/users',
                  }).catch(() => {});
                  // Coproducer também precisa saber — ele pode reenviar do dashboard dele
                  if (coproducer) {
                    notifyCoproducer({
                      coproducerId: coproducer.id,
                      type: 'credential_fail',
                      title: '🚨 Acesso não entregue',
                      body: `${user.email} pagou mas o WhatsApp falhou (${lastStatus}). Avise o cliente ou peça ao admin pra reenviar.`,
                      url: '/coproducer/users',
                    }).catch(() => {});
                  }
                }
              } else {
                console.warn(`[WEBHOOK] ⚠️ Komunika instanceId missing — credentials NOT sent via WhatsApp`);
              }
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
        let affiliateCredited = false;
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
              affiliateCredited = true;
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

        // ── Partner (sócios) revenue-share credit ──────────────────────
        // Splits the NET of the main-product sale among the fixed partners.
        // Excluded: webhook re-deliveries (txExistedBefore), external
        // coproducer sales (coproducer set), and affiliate-attributed sales
        // (affiliateCredited). Stripe sales never reach this Lojou handler.
        try {
          if (!txExistedBefore && !coproducer && !affiliateCredited) {
            // Count items for the Lojou fixed fee: principal + each bump.
            const numItems = 1 + (isCloseFriends ? 1 : 0) + (bump197 ? 1 : 0);
            const r = await creditPartnersForOrder({
              orderId: String(orderId),
              amount: totalAmount,
              numItems,
            });
            if (r.credited > 0) {
              console.log(`[WEBHOOK] 🤝 Sócios creditados: ${r.credited} (base=${r.base} MZN)`);
            }
          }
        } catch (partnerErr) {
          console.error('[WEBHOOK] Partner credit error (non-blocking):', partnerErr);
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

            // Refund revokes Komunika too (no-op if not provisioned).
            deprovisionKomunika(user.id, 'refunded').catch((e) =>
              console.error('[WEBHOOK] Komunika deprovision failed (non-blocking):', e?.message || e),
            );

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

        // Reverse any partner (sócios) commissions tied to this order
        try {
          const reversedPartners = await reversePartnersForOrder(String(orderId));
          if (reversedPartners > 0) {
            console.log(`[WEBHOOK] ↩️ Reversed ${reversedPartners} partner commission(s) for ${orderId}`);
          }
        } catch (partnerErr) {
          console.error('[WEBHOOK] Partner refund error (non-blocking):', partnerErr);
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
        const checkoutAssistantId = systemConfig?.komunikaCheckoutAssistantId || env.KOMUNIKA_SDR_CHECKOUT_ASSISTANT_ID;

        // Delay strategy: Just mark as 'checkout_pending'. The Cron Job handles
        // the rest (SDR outbound initiate when the abandonment window elapses).
        if (customerPhone && env.KOMUNIKA_ADMIN_API_KEY && checkoutAssistantId) {
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

/* ────────────────────────────────────────────────────────────────────────
 * Stripe webhook
 *
 * Mounted at POST /api/webhooks/stripe. Express's raw body middleware
 * (set in server.ts for /api/webhooks/*) keeps `req.body` as a Buffer so
 * the signature verification can run against the exact bytes Stripe sent.
 *
 * Events we handle:
 *   • checkout.session.completed   → first payment / new subscription
 *   • invoice.paid                 → renewal (skip if same session)
 *   • invoice.payment_failed       → push to superadmins
 *   • customer.subscription.deleted → mark cancelled
 *
 * Other events ack with 200 and do nothing — Stripe retries non-2xx, so
 * we don't want unknown events to clog the queue.
 *
 * Idempotency: every Transaction we create is keyed by the Stripe
 * payment_intent or invoice id (stored on orderId). Re-delivery of the
 * same event resolves to upsert / no-op.
 * ───────────────────────────────────────────────────────────────────── */
router.post('/stripe', async (req: Request, res: Response) => {
  if (!isStripeConfigured()) {
    console.warn('[STRIPE-WEBHOOK] Received but Stripe not configured — set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET');
    return res.status(503).json({ error: 'stripe-not-configured' });
  }

  const signature = req.headers['stripe-signature'];
  if (!signature || Array.isArray(signature)) {
    return res.status(400).json({ error: 'missing-signature' });
  }

  // Express's raw middleware leaves the body as a Buffer.
  const rawBody: Buffer = Buffer.isBuffer(req.body)
    ? req.body
    : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

  let event: Stripe.Event;
  try {
    event = verifyStripeWebhook(rawBody, signature);
  } catch (e: any) {
    console.error('[STRIPE-WEBHOOK] 🚨 Signature verification failed:', e?.message || e);
    return res.status(400).json({ error: 'bad-signature' });
  }

  console.log(`[STRIPE-WEBHOOK] ✅ Verified event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoiceFailed(invoice);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(sub);
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(charge);
        break;
      }
      default:
        console.log(`[STRIPE-WEBHOOK] Unhandled event type: ${event.type}`);
    }
    return res.json({ received: true });
  } catch (e: any) {
    // Don't 500 — Stripe retries on non-2xx and we'd duplicate side effects
    // on the next retry. Log loudly and ack the event; the issue is on us.
    console.error('[STRIPE-WEBHOOK] 🚨 Handler threw:', e);
    return res.status(200).json({ received: true, processingError: e?.message || 'unknown' });
  }
});

/**
 * Handle `checkout.session.completed` — first payment on a Stripe
 * Payment Link. Creates the user (or reactivates an existing one),
 * generates credentials, sends WhatsApp, creates the Transaction.
 *
 * Reconciles the MANUAL_STRIPE_* placeholder (case of users who were
 * granted access manually before Stripe was wired — Esley etc.) by
 * matching on email.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Pull the customer details. Payment Links always create a Customer
  // before completing, so session.customer is set.
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!customerId) {
    console.warn('[STRIPE-WEBHOOK/CHECKOUT] No customer on session — skipping');
    return;
  }
  const cust = await retrieveCustomer(customerId);
  const email = (session.customer_email || session.customer_details?.email || cust?.email || '').toLowerCase().trim();
  const name = session.customer_details?.name || cust?.name || email.split('@')[0] || 'Cliente';
  const phoneRaw = session.customer_details?.phone || cust?.phone || '';
  const phone = phoneRaw.replace(/\D/g, '');

  if (!email) {
    console.warn('[STRIPE-WEBHOOK/CHECKOUT] No email on session — cannot create user');
    return;
  }

  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  const amount = (session.amount_total ?? 0) / 100;
  const currency = (session.currency || 'eur').toUpperCase();
  const orderRef = `stripe_${session.id}`;

  // Idempotency: if we already processed this session, no-op
  const existingTx = await prisma.transaction.findUnique({ where: { orderId: orderRef } });
  if (existingTx) {
    console.log(`[STRIPE-WEBHOOK/CHECKOUT] Already processed ${orderRef}, skipping`);
    return;
  }

  // Reconciliation: if a MANUAL_STRIPE_* user exists with this email,
  // link it instead of creating a new user.
  const reconciledId = await reconcileManualStripe({
    email,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });

  const now = new Date();
  const subEnd = new Date(now.getTime() + BASE_SUBSCRIPTION_DAYS * DAY_MS);

  let rawPassword: string | null = null;
  // Captured in every branch so we can provision Komunika once below.
  let provisionedUserId: string | null = null;

  if (reconciledId) {
    // Existing manual user — just extend the subscription, don't re-send credentials
    await prisma.user.update({
      where: { id: reconciledId },
      data: {
        subscriptionStatus: 'active',
        subscriptionStart: now,
        subscriptionEnd: subEnd,
      },
    });
    console.log(`[STRIPE-WEBHOOK/CHECKOUT] Reconciled existing user ${email} → no credentials resend`);
    provisionedUserId = reconciledId;
  } else {
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      // Reactivate, reset password (matches Lojou behavior)
      const pw = await generateUserPassword();
      rawPassword = pw.raw;
      await prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          passwordHash: pw.hash,
          subscriptionStatus: 'active',
          subscriptionStart: now,
          subscriptionEnd: subEnd,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId ?? null,
          role: existingByEmail.role === 'admin' ? 'admin' : 'member',
        },
      });
      provisionedUserId = existingByEmail.id;
    } else {
      // Brand new user
      const pw = await generateUserPassword();
      rawPassword = pw.raw;
      const created = await prisma.user.create({
        data: {
          name,
          email,
          phone: phone || `stripe_${Date.now()}`, // phone is @unique on User; fall back when Stripe didn't provide one
          passwordHash: pw.hash,
          role: 'member',
          subscriptionStatus: 'active',
          subscriptionStart: now,
          subscriptionEnd: subEnd,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId ?? null,
        },
      });
      provisionedUserId = created.id;
    }
  }

  // Create the Transaction (idempotent via orderId)
  await prisma.transaction.create({
    data: {
      orderId: orderRef,
      userEmail: email,
      userPhone: phone,
      userName: name,
      amount,
      currency,
      status: 'approved',
      paymentMethod: 'card',
      gateway: 'stripe',
      stripePaymentIntentId: paymentIntentId ?? null,
      grossAmount: amount,
      // Stripe fees are reported separately on the BalanceTransaction —
      // we leave the column null here rather than guess at the rate
      // (varies by country / card type). The finance UI displays "—".
      lojouFee: 0,
      coproducerFee: 0,
      isRenewal: false,
    },
  });

  // ── Komunika embedded module (bundled with the CZ subscription) ──────
  // The Lojou path provisions at L444; the Stripe (card/international) path
  // must do the same or these members never get a tenant. Idempotent +
  // fire-and-forget with internal retry.
  if (provisionedUserId) {
    syncKomunikaOnApprovedOrder(provisionedUserId).catch((e) =>
      console.error('[STRIPE-WEBHOOK/CHECKOUT] Komunika sync failed (non-blocking):', e?.message || e),
    );
  }

  // Send credentials only when we generated a new password (skip for reconciliations)
  if (rawPassword && phone) {
    await sendCredentialsViaWhatsApp({ phone, email, rawPassword });
  } else if (rawPassword && !phone) {
    console.warn(`[STRIPE-WEBHOOK/CHECKOUT] ${email} created but no phone — credentials NOT sent via WhatsApp`);
    sendPushToSuperAdmins({
      title: '⚠️ Cliente Stripe sem telefone',
      body: `${email} pagou mas o checkout não capturou telefone. Envie acesso manualmente.`,
      url: '/admin/users',
    }).catch(() => {});
  }

  await notifyAdminOfSale({
    customerName: name,
    customerEmail: email,
    amount,
    currency,
    gateway: 'stripe',
    paymentMethod: 'card',
  });
}

/**
 * Handle `invoice.paid` — recurring subscription renewals.
 * Skipped when the invoice's payment_intent matches the one we already
 * processed in checkout.session.completed (same charge).
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subId) return;
  const user = await prisma.user.findFirst({ where: { stripeSubscriptionId: subId } });
  if (!user) {
    console.warn(`[STRIPE-WEBHOOK/INVOICE] No user for subscription ${subId} — likely first payment, will be handled by checkout.session.completed`);
    return;
  }
  const orderRef = `stripe_inv_${invoice.id}`;
  const existing = await prisma.transaction.findUnique({ where: { orderId: orderRef } });
  if (existing) return;

  const amount = (invoice.amount_paid ?? 0) / 100;
  const currency = (invoice.currency || 'eur').toUpperCase();
  const paymentIntentId = typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id;

  // Skip the very first invoice — same charge as the checkout session
  const sessionTxExists = paymentIntentId
    ? await prisma.transaction.findFirst({ where: { stripePaymentIntentId: paymentIntentId } })
    : null;
  if (sessionTxExists) {
    console.log(`[STRIPE-WEBHOOK/INVOICE] Invoice ${invoice.id} is the initial charge — already recorded by checkout.session.completed`);
    return;
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'active',
      subscriptionStart: user.subscriptionStart || now,
      subscriptionEnd: new Date(now.getTime() + BASE_SUBSCRIPTION_DAYS * DAY_MS),
    },
  });

  // Renewal → extend the Komunika add-on window (no-op if not provisioned).
  updateKomunikaSubscription(user.id, 'active').catch((e) =>
    console.error('[STRIPE-WEBHOOK/INVOICE] Komunika update failed (non-blocking):', e?.message || e),
  );

  await prisma.transaction.create({
    data: {
      orderId: orderRef,
      userEmail: user.email,
      userPhone: user.phone,
      userName: user.name,
      amount,
      currency,
      status: 'approved',
      paymentMethod: 'card',
      gateway: 'stripe',
      stripePaymentIntentId: paymentIntentId ?? null,
      stripeInvoiceId: invoice.id,
      grossAmount: amount,
      lojouFee: 0,
      coproducerFee: 0,
      isRenewal: true,
    },
  });

  await notifyAdminOfSale({
    customerName: user.name,
    customerEmail: user.email,
    amount,
    currency,
    gateway: 'stripe',
    paymentMethod: 'card (renovação)',
  });
}

async function handleInvoiceFailed(invoice: Stripe.Invoice): Promise<void> {
  const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  const user = subId ? await prisma.user.findFirst({ where: { stripeSubscriptionId: subId } }) : null;
  console.warn(`[STRIPE-WEBHOOK/INVOICE-FAILED] sub=${subId} user=${user?.email || 'unknown'}`);

  // Soft-suspend Komunika during Stripe dunning; full revoke happens later on
  // customer.subscription.deleted. Guarded — user may be null.
  if (user) {
    updateKomunikaSubscription(user.id, 'past_due').catch((e) =>
      console.error('[STRIPE-WEBHOOK/INVOICE-FAILED] Komunika past_due sync failed (non-blocking):', e?.message || e),
    );
  }

  sendPushToSuperAdmins({
    title: '⚠️ Stripe: pagamento falhou',
    body: `${user?.email || 'Cliente desconhecido'} — invoice ${invoice.id} (${(invoice.amount_due ?? 0) / 100} ${invoice.currency?.toUpperCase()})`,
    url: '/admin/finance',
  }).catch(() => {});
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const user = await prisma.user.findFirst({ where: { stripeSubscriptionId: sub.id } });
  if (!user) return;
  // Mirror the Lojou / in-app cancellation flow: deactivate + drop Close Friends.
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'canceled',
      isActive: false,
      closeFriends: false,
      closeFriendsUntil: null,
    },
  });
  try {
    await prisma.systemConfig.update({ where: { id: 'singleton' }, data: { currentUsers: { decrement: 1 } } });
  } catch {}

  // Cancelled subscription revokes Komunika (no-op if not provisioned).
  deprovisionKomunika(user.id, 'cancelled').catch((e) =>
    console.error('[STRIPE-WEBHOOK/SUB-DELETED] Komunika deprovision failed (non-blocking):', e?.message || e),
  );

  console.log(`[STRIPE-WEBHOOK/SUB-DELETED] ${user.email} → canceled`);

  // Same WhatsApp confirmation a Lojou / in-app cancellation sends.
  sendCancellationMessage(user).catch((e) => console.error('[STRIPE-WEBHOOK/SUB-DELETED] WhatsApp failed:', e?.message || e));

  sendPushToSuperAdmins({
    title: '🔻 Stripe: assinatura cancelada',
    body: `${user.email} cancelou a assinatura no Stripe.`,
    url: '/admin/users',
  }).catch(() => {});
}

/**
 * Handle a Stripe `charge.refunded` — mirrors the Lojou `order.refunded` flow:
 * deactivate the user, mark the transaction refunded, reverse commissions and
 * notify the superadmins. Matches the transaction by payment intent.
 */
async function handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) {
    console.warn('[STRIPE-WEBHOOK/REFUND] charge without payment_intent — skipping');
    return;
  }
  const tx = await prisma.transaction.findFirst({
    where: { OR: [{ stripePaymentIntentId: pi }, { orderId: pi }] },
  });
  if (!tx) {
    console.warn(`[STRIPE-WEBHOOK/REFUND] no transaction for payment_intent ${pi}`);
    return;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(tx.userEmail ? [{ email: tx.userEmail }] : []),
        ...(tx.userPhone ? [{ phone: tx.userPhone }] : []),
      ],
    },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: 'canceled',
        isActive: false,
        closeFriends: false,
        closeFriendsUntil: null,
      },
    });
    try {
      await prisma.systemConfig.update({ where: { id: 'singleton' }, data: { currentUsers: { decrement: 1 } } });
    } catch {}

    // Refund revokes Komunika too (no-op if not provisioned).
    deprovisionKomunika(user.id, 'refunded').catch((e) =>
      console.error('[STRIPE-WEBHOOK/REFUND] Komunika deprovision failed (non-blocking):', e?.message || e),
    );
  }

  await prisma.transaction.update({
    where: { id: tx.id },
    data: { status: 'refunded' },
  });

  try {
    await refundCommissionForOrder(String(tx.orderId));
    await reversePartnersForOrder(String(tx.orderId));
  } catch (e: any) {
    console.error('[STRIPE-WEBHOOK/REFUND] commission reversal error (non-blocking):', e?.message || e);
  }

  console.log(`[STRIPE-WEBHOOK/REFUND] 🔄 refunded ${tx.orderId}${user ? ` — ${user.email}` : ''}`);
  sendPushToSuperAdmins({
    title: '🔄 Stripe: reembolso',
    body: `Reembolso no Stripe${user ? ` — ${user.name || user.email}` : ` — ${tx.orderId}`}`,
    url: '/admin/finance',
  }).catch(() => {});
}

export default router;
