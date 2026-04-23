import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

const LOJOU_API = `${env.LOJOU_API_URL}/v1`;
const LOJOU_KEY = env.LOJOU_API_KEY;

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
    try {
      // First, get the product (or use LOJOU_PRODUCT_ID env var)
      const productId = process.env.LOJOU_PRODUCT_ID;

      if (productId && LOJOU_KEY) {
        const orderPayload: any = {
          product_id: productId,
          customer: {
            name,
            email,
            phone: whatsapp || phone,
          },
        };

        const orderRes = await fetch(`${LOJOU_API}/orders`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOJOU_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(orderPayload),
        });

        const orderData = await orderRes.json();
        console.log('[Landing] Lojou order response:', JSON.stringify(orderData));
        
        checkoutUrl = orderData?.data?.checkout_url 
          || orderData?.checkout_url 
          || orderData?.order?.checkout_url 
          || '';
      } else {
        console.log('[Landing] LOJOU_PRODUCT_ID or LOJOU_API_KEY not set, skipping order creation');
      }
    } catch (e) {
      console.error('[Landing] Lojou order creation failed:', e);
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
