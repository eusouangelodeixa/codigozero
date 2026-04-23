import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

const LOJOU_API = `${env.LOJOU_API_URL}/v1`;
const LOJOU_KEY = env.LOJOU_API_KEY;

// Código Zero product + plan on Lojou
const PRODUCT_PID = process.env.LOJOU_PRODUCT_PID || 'uoEHz';
const PLAN_ID = process.env.LOJOU_PLAN_ID || 'tbo8f';
const PRODUCT_PRICE = 797;

/**
 * POST /api/landing/lead
 * Capture lead data from landing page gate form.
 * Creates a Lojou subscription order and returns checkout_url.
 */
router.post('/lead', async (req: Request, res: Response) => {
  try {
    const { name, phone, whatsapp, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    const contactPhone = whatsapp || phone || `+258${Date.now().toString().slice(-9)}`;

    // Try to find existing user by email first
    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name },
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
        },
      });
    }

    // Create Lojou order with plan_id for recurring checkout
    let checkoutUrl = '';
    if (LOJOU_KEY) {
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
            amount: PRODUCT_PRICE,
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
            data: { lojouOrderId: orderData.order_number },
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
    });
  } catch (error: any) {
    console.error('[Landing] Lead capture error:', error);
    res.status(500).json({ error: 'Erro ao processar. Tente novamente.' });
  }
});

export default router;
