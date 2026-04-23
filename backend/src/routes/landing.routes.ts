import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const router = Router();
const prisma = new PrismaClient();

const LOJOU_API = 'https://api.lojou.app/v1';
const LOJOU_KEY = env.LOJOU_API_KEY;

/**
 * POST /api/landing/lead
 * Capture lead data from landing page gate form.
 * Creates a Lojou order (checkout) and returns checkout_url.
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
        password: '', // Will be set after payment via webhook
        subscriptionStatus: 'lead',
      },
    });

    // Create Lojou order to get checkout_url
    let checkoutUrl = '#';
    try {
      const orderRes = await fetch(`${LOJOU_API}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOJOU_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer: {
            name,
            email,
            phone: whatsapp || phone,
          },
        }),
      });

      if (orderRes.ok) {
        const orderData = await orderRes.json();
        checkoutUrl = orderData.data?.checkout_url || orderData.checkout_url || '#';
      }
    } catch (e) {
      console.error('[Landing] Lojou order creation failed:', e);
      // Fallback: continue without checkout URL — user can still see the page
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
