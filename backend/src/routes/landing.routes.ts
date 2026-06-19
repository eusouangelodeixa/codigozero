import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import crypto from 'crypto';
import { AFFILIATE_PRODUCT } from '../services/affiliate.service';
import { getActivePrice } from '../lib/pricing';
import { notifyCoproducer } from '../services/coproducer.service';

const router = Router();
const prisma = new PrismaClient();

const LOJOU_API = `${env.LOJOU_API_URL}/v1`;
const LOJOU_KEY = env.LOJOU_API_KEY;

// Código Zero product + plan on Lojou
const PRODUCT_PID = env.LOJOU_PRODUCT_PID;
const PLAN_ID = env.LOJOU_PLAN_ID;

// Throttle lead capture: at most 5 submissions / 10 min per IP. Curbs bots
// spamming the funnel form (and the Lojou order calls it triggers) without
// getting in the way of a real buyer retrying.
const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

/**
 * POST /api/landing/lead
 * Capture lead data from landing page gate form.
 * Creates a Lojou subscription order and returns checkout_url.
 */
router.post('/lead', leadLimiter, async (req: Request, res: Response) => {
  try {
    const { name, phone, whatsapp, email, surveyAnswers, affiliateCode, coproducerCode, phoneCode } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    const contactPhone = whatsapp || phone || `+258${Date.now().toString().slice(-9)}`;

    // ── International routing ──────────────────────────────────────────
    // Any non-MZ phone code routes the buyer to Stripe (hosted Payment
    // Link). The lead is still captured locally so remarketing works,
    // and the Stripe webhook will reconcile by email when payment lands.
    // When STRIPE_CHECKOUT_URL isn't configured we fall back silently
    // to the normal Lojou flow — better than 500ing the form.
    const dialCode = String(phoneCode || '').trim();
    const isInternational = dialCode !== '' && dialCode !== '+258';
    const useStripe = isInternational && Boolean(env.STRIPE_CHECKOUT_URL);

    // ── Affiliate check ────────────────────────────────────────────────
    // If we got an affiliate code, validate it before anything else. An
    // invalid code is silently ignored (no error) so a typo on a copied
    // link doesn't break the lead form, but the lead won't get attributed.
    let affiliateAccount: { id: string; code: string } | null = null;
    if (affiliateCode && typeof affiliateCode === 'string') {
      const code = affiliateCode.trim();
      const acc = await prisma.affiliateAccount.findUnique({
        where: { code },
        select: { id: true, code: true, enabled: true },
      });
      if (acc && acc.enabled) affiliateAccount = { id: acc.id, code: acc.code };
    }

    // ── Coproducer check ───────────────────────────────────────────────
    // Same shape as affiliate: validate the code, ignore silently on miss.
    // Coproducer + affiliate are mutually exclusive at the URL level
    // (/c/code vs /r/code), but if both arrive here, affiliate wins (the
    // affiliate flow uses its own product pid in Lojou).
    let coproducerAccount: { id: string; code: string; productPid: string; publicCheckoutUrl: string | null; planId: string | null } | null = null;
    if (coproducerCode && typeof coproducerCode === 'string') {
      const code = coproducerCode.trim();
      const acc = await prisma.coproducerAccount.findUnique({
        where: { code },
        select: { id: true, code: true, productPid: true, publicCheckoutUrl: true, planId: true, enabled: true },
      });
      if (acc && acc.enabled) {
        coproducerAccount = { id: acc.id, code: acc.code, productPid: acc.productPid, publicCheckoutUrl: acc.publicCheckoutUrl, planId: acc.planId };
      }
    }

    const isAffiliateFlow = affiliateAccount !== null;
    const isCoproducerFlow = !isAffiliateFlow && coproducerAccount !== null;

    // Try to find existing user by email first
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name,
          remarketingStage: 'none',
          ...(surveyAnswers && { surveyAnswers }),
          // Stamp the affiliate code on the User row only if not already set.
          // Avoids re-attributing an existing customer to a new affiliate.
          ...(affiliateAccount && !user.referredByCode
            ? { referredByCode: affiliateAccount.code }
            : {}),
          // Same rule for coproducer attribution.
          ...(coproducerAccount && !user.referredByCoproducer
            ? { referredByCoproducer: coproducerAccount.code }
            : {}),
        },
      });
    } else {
      const phoneExists = await prisma.user.findUnique({ where: { phone: contactPhone } });

      user = await prisma.user.create({
        data: {
          email,
          name,
          phone: phoneExists ? `${contactPhone}_${Date.now()}` : contactPhone,
          passwordHash: crypto.randomBytes(32).toString('hex'),
          subscriptionStatus: 'lead',
          ...(surveyAnswers && { surveyAnswers }),
          ...(affiliateAccount ? { referredByCode: affiliateAccount.code } : {}),
          ...(coproducerAccount ? { referredByCoproducer: coproducerAccount.code } : {}),
        },
      });

      // Push the coproducer about the brand-new lead. Skipped when the
      // user already existed (existing leads/customers re-submitting the
      // form shouldn't generate noise).
      if (coproducerAccount) {
        notifyCoproducer({
          coproducerId: coproducerAccount.id,
          type: 'lead',
          title: '👤 Novo lead',
          body: `${name} (${email}) preencheu o formulário no seu link.`,
          url: '/coproducer/leads',
        }).catch(() => {});
      }
    }

    // Record (or update) the referral row when applicable.
    if (affiliateAccount) {
      const existingReferral = await prisma.affiliateReferral.findFirst({
        where: { affiliateId: affiliateAccount.id, userId: user.id },
      });
      if (!existingReferral) {
        await prisma.affiliateReferral.create({
          data: {
            affiliateId: affiliateAccount.id,
            userId: user.id,
            email,
            phone: contactPhone,
            status: 'pending',
          },
        });
      }
    }

    // ── Checkout URL strategy ─────────────────────────────────────────
    // Order of precedence:
    //   0. International (any non-MZ phoneCode) → Stripe hosted Payment Link
    //   1. Affiliate landing → standard public affiliate checkout
    //   2. Coproducer landing → publicCheckoutUrl OR Lojou Orders API
    //   3. Default landing → personalized Lojou order (prefilled checkout)
    let checkoutUrl = '';

    if (useStripe) {
      checkoutUrl = env.STRIPE_CHECKOUT_URL;
      await prisma.user.update({
        where: { id: user.id },
        data: { checkoutUrl },
      });
    } else if (isAffiliateFlow) {
      checkoutUrl = AFFILIATE_PRODUCT.checkoutUrl;
      await prisma.user.update({
        where: { id: user.id },
        data: { checkoutUrl },
      });
    } else if (isCoproducerFlow && coproducerAccount) {
      // Coproducer landing. Priority:
      //   1. publicCheckoutUrl explicitamente configurado pelo superadmin
      //      — quando definido, ele é a fonte da verdade (e respeita
      //      configurações como bump pré-marcado, descontos, etc. que
      //      o coprodutor já tem na própria página Lojou).
      //   2. Pedido prefilled via Lojou Orders API (caminho do produto
      //      principal — pega nome/email/telefone).
      //   3. Página pública genérica /p/{pid} como último recurso.
      if (coproducerAccount.publicCheckoutUrl) {
        checkoutUrl = coproducerAccount.publicCheckoutUrl;
        await prisma.user.update({ where: { id: user.id }, data: { checkoutUrl } });
      } else if (LOJOU_KEY) {
        const fallback = `https://pay.lojou.app/p/${coproducerAccount.productPid}`;
        try {
          const orderRes = await fetch(`${LOJOU_API}/orders`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${LOJOU_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_pid: coproducerAccount.productPid,
              ...(coproducerAccount.planId ? { plan_id: coproducerAccount.planId } : {}),
              amount: await getActivePrice(),
              customer: { name, email, mobile_number: contactPhone },
            }),
          });
          const orderData = await orderRes.json();
          if (orderData?.checkout_url) {
            checkoutUrl = orderData.checkout_url;
            await prisma.user.update({
              where: { id: user.id },
              data: { lojouOrderId: orderData.order_number, checkoutUrl },
            });
          } else {
            checkoutUrl = fallback;
            console.warn('[Landing/Coproducer] Order API not OK, using public fallback:', JSON.stringify(orderData));
          }
        } catch (e) {
          checkoutUrl = fallback;
          console.warn('[Landing/Coproducer] Order API threw, using public fallback:', e);
        }
      } else {
        checkoutUrl = `https://pay.lojou.app/p/${coproducerAccount.productPid}`;
      }
    } else if (LOJOU_KEY) {
      try {
        const orderRes = await fetch(`${LOJOU_API}/orders`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOJOU_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_pid: PRODUCT_PID,
            plan_id: PLAN_ID,
            amount: await getActivePrice(),
            customer: {
              name,
              email,
              mobile_number: contactPhone,
            },
          }),
        });

        const orderData = await orderRes.json();
        console.log('[Landing] Lojou:', orderData.checkout_url ? '✅ checkout OK' : JSON.stringify(orderData));

        if (orderData.checkout_url) {
          checkoutUrl = orderData.checkout_url;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              lojouOrderId: orderData.order_number,
              checkoutUrl: orderData.checkout_url,
            },
          });
        }
      } catch (e) {
        console.error('[Landing] Lojou error:', e);
      }
    }

    res.json({
      success: true,
      leadId: user.id,
      checkoutUrl,
      attributed: isAffiliateFlow,
    });
  } catch (error: any) {
    console.error('[Landing] Lead capture error:', error);
    res.status(500).json({ error: 'Erro ao processar. Tente novamente.' });
  }
});

/**
 * POST /api/landing/checkout-click
 * Called when a lead clicks the CTA and goes to checkout.
 * Marks the lead as checkout_pending so the recovery cron can follow up.
 */
router.post('/checkout-click', async (req: Request, res: Response) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId obrigatório' });

    await prisma.user.update({
      where: { id: leadId },
      data: { remarketingStage: 'checkout_pending' },
    });

    return res.json({ success: true });
  } catch (error) {
    // Silently ignore — non-critical tracking call
    return res.json({ success: false });
  }
});


/**
 * GET /api/landing/config
 * Public endpoint — returns landing page config (texts, VSL URL, etc.)
 */
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const config = await prisma.landingConfig.findFirst({ where: { id: 'singleton' } });
    res.json({ config: config || {} });
  } catch (error) {
    res.json({ config: {} });
  }
});

/**
 * GET /api/landing/resolve-coproducer/:code
 * Public — used by /c/{code} to validate the code and resolve the
 * fallback checkout URL (used when the Lojou order API is unavailable).
 */
router.get('/resolve-coproducer/:code', async (req: Request, res: Response) => {
  try {
    const code = (req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'código obrigatório' });
    const acc = await prisma.coproducerAccount.findUnique({
      where: { code },
      select: {
        code: true,
        productPid: true,
        publicCheckoutUrl: true,
        enabled: true,
        vslEmbedHtml: true,
        headScripts: true,
      },
    });
    if (!acc || !acc.enabled) {
      return res.status(404).json({ error: 'Código de coprodução não encontrado' });
    }
    const checkoutUrl = acc.publicCheckoutUrl || `https://pay.lojou.app/p/${acc.productPid}`;
    res.json({
      code: acc.code,
      checkoutUrl,
      vslEmbedHtml: acc.vslEmbedHtml,
      headScripts: acc.headScripts,
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao validar código' });
  }
});

export default router;
