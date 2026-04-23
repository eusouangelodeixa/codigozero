import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

const LOJOU_API = `${env.LOJOU_API_URL}/v1`;
const LOJOU_KEY = env.LOJOU_API_KEY;

// Código Zero product on Lojou
const PRODUCT_PID = process.env.LOJOU_PRODUCT_PID || 'uoEHz';
const PRODUCT_PRICE = 797;

/**
 * POST /api/landing/lead
 * Capture lead data from landing page gate form.
 * Creates a Lojou order and returns checkout_url.
 */
router.post('/lead', async (req: Request, res: Response) => {
  try {
    const { name, phone, whatsapp, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    // Store lead in DB (upsert by email)
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, phone: whatsapp || phone },
      create: {
        email,
        name,
        phone: whatsapp || phone,
        password: '',
        subscriptionStatus: 'lead',
      },
    });

    // Create Lojou order to get checkout_url
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
            amount: PRODUCT_PRICE,
            customer: {
              name,
              email,
              mobile_number: whatsapp || phone || '',
            },
          }),
        });

        const orderData = await orderRes.json();
        console.log('[Landing] Lojou order response:', JSON.stringify(orderData));

        if (orderData.checkout_url) {
          checkoutUrl = orderData.checkout_url;
        }
      } catch (e) {
        console.error('[Landing] Lojou order creation failed:', e);
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
