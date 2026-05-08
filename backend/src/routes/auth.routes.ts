import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { lojouService } from '../services/lojou.service';

const router = Router();
const prisma = new PrismaClient();

// Avatar upload config
const avatarDir = path.join(__dirname, '..', '..', 'uploads', 'avatars');
if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são permitidas'));
  },
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Conta desativada. Entre em contato com o suporte.' });
    }

    const token = jwt.sign(
      { userId: user.id },
      env.JWT_SECRET,
      { expiresIn: '7d' as any }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        avatarUrl: user.avatarUrl,
        hasCompletedOnboarding: user.hasCompletedOnboarding,
      },
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
        dailySearchCount: true,
        lastSearchDate: true,
        createdAt: true,
        komunikaApiKey: true,
        komunikaInstanceId: true,
        avatarUrl: true,
        hasCompletedOnboarding: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({ user });
  } catch (error) {
    console.error('[AUTH] Get me error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PATCH /api/auth/profile — update own profile
router.patch('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, avatarUrl } = req.body;
    const data: any = {};
    if (name) data.name = name;
    if (phone) data.phone = phone;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, name: true, email: true, phone: true, role: true, subscriptionStatus: true, subscriptionEnd: true, avatarUrl: true },
    });

    return res.json({ user });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Este telefone já está em uso.' });
    return res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// PATCH /api/auth/onboarding-complete
router.patch('/onboarding-complete', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { hasCompletedOnboarding: true },
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao completar onboarding' });
  }
});

// PATCH /api/auth/integrations — update komunika keys
router.patch('/integrations', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { komunikaApiKey, komunikaInstanceId } = req.body;
    
    // Test the Komunika API Connection if keys are provided
    if (komunikaApiKey && komunikaInstanceId) {
      try {
        // Assume komunika is hosted at the same domain or another known domain. 
        // For now, the user must provide the Komunika domain or we assume a generic one. 
        // We will just save it without strict validation if we don't know the domain, 
        // but if we do, we could fetch `/api/v1/instances/${komunikaInstanceId}/status`
      } catch (e) {}
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { komunikaApiKey, komunikaInstanceId },
      select: { komunikaApiKey: true, komunikaInstanceId: true },
    });

    return res.json({ success: true, integrations: user });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao atualizar integrações' });
  }
});

// PATCH /api/auth/password — change own password
router.patch('/password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Preencha ambos os campos.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Senha atual incorreta.' });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    return res.json({ success: true, message: 'Senha atualizada com sucesso.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// POST /api/auth/retention-offer — create a retention discount before cancel
router.post('/retention-offer', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || user.subscriptionStatus !== 'active') {
      return res.status(400).json({ error: 'Nenhuma assinatura ativa' });
    }

    // 1. Elegibilidade (Anti-Fraude)
    if (user.retentionCouponsUsed > 0 && user.paymentsSinceLastCoupon < 3) {
      console.log(`[RETENTION] 🛑 User ${user.email} is not eligible (Used: ${user.retentionCouponsUsed}, Payments since last: ${user.paymentsSinceLastCoupon})`);
      return res.json({ offer: null, message: 'Não elegível para nova oferta' });
    }

    const LOJOU_API = `${process.env.LOJOU_API_URL || 'https://api.lojou.app'}/v1`;
    const LOJOU_KEY = process.env.LOJOU_API_KEY;

    if (!LOJOU_KEY) {
      return res.json({ offer: null, message: 'Gateway não configurado' });
    }

    // 2. Criar cupão na Lojou
    const code = `FICA10_${user.id.slice(0, 6).toUpperCase()}`;
    let checkoutUrl = '';

    try {
      const discountRes = await fetch(`${LOJOU_API}/discounts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${LOJOU_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, type: 'percentage', value: 10, uses_limit: 1, active: true }),
      });

      if (discountRes.ok || discountRes.status === 409) {
        console.log(`[RETENTION] ✅ Coupon ${code} ready for ${user.email} (Status: ${discountRes.status})`);
        
        // 3. Gerar novo Checkout Link com o cupão aplicado
        const orderData = await lojouService.createOrder({
          amount: 797,
          product_pid: process.env.LOJOU_PRODUCT_PID || 'uoEHz',
          plan_id: process.env.LOJOU_PLAN_ID || 'tbo8f',
          coupon_code: code,
          customer: {
            name: user.name,
            email: user.email,
            mobile_number: user.phone,
          }
        });

        if (orderData?.checkout_url) {
          checkoutUrl = orderData.checkout_url;

          // 4. Update user tracking limits
          await prisma.user.update({
            where: { id: user.id },
            data: {
              retentionCouponsUsed: { increment: 1 },
              paymentsSinceLastCoupon: 0,
              renewalUrl: checkoutUrl, // Save as their new renewal link
            }
          });

          // 5. Enviar mensagem pelo WhatsApp
          const config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
          if (config?.komunikaAdminApiKey && config.komunikaInstanceId && user.phone) {
            const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
            let phone = user.phone.replace(/\D/g, '');
            if (phone.length === 9 && phone.startsWith('8')) phone = `258${phone}`;
            
            const retentionMsg = `Olá ${user.name.split(' ')[0]}, vimos que estás a tentar cancelar a tua assinatura. 😔\n\nNão queremos perder-te! Por isso, gerámos um link de pagamento especial já com *10% de Desconto* aplicado para a tua próxima renovação.\n\n🔗 Usa este link para renovar agora: ${checkoutUrl}\n\nObrigado por estares connosco! 🤝`;
            
            fetch(`${apiUrl}/api/v1/messages/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-API-Key': config.komunikaAdminApiKey },
              body: JSON.stringify({ instanceId: config.komunikaInstanceId, to: phone, type: 'text', content: retentionMsg }),
            }).catch(console.error);
          }
        }
      } else {
        console.warn(`[RETENTION] Coupon creation failed: ${discountRes.status}`);
      }
    } catch (e) {
      console.warn('[RETENTION] Lojou discount API error:', e);
    }

    return res.json({
      offer: checkoutUrl ? {
        code,
        discount: '10%',
        message: 'Enviámos-lhe uma mensagem especial no WhatsApp com um link de desconto para ficar connosco!',
      } : null,
    });
  } catch (error) {
    console.error('[RETENTION] Error:', error);
    return res.status(500).json({ error: 'Erro ao gerar oferta' });
  }
});

// POST /api/auth/cancel-subscription — member cancels own subscription
router.post('/cancel-subscription', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { password, reason, feedback } = req.body;
    if (!password) return res.status(400).json({ error: 'Senha obrigatória para confirmação.' });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    if (user.subscriptionStatus === 'canceled') {
      return res.status(400).json({ error: 'Sua assinatura já está cancelada.' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Senha incorreta.' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: 'canceled',
        isActive: false,
      },
    });

    // Decrement user count
    try {
      await prisma.systemConfig.update({
        where: { id: 'singleton' },
        data: { currentUsers: { decrement: 1 } },
      });
    } catch {}

    const reasonText = reason || 'Não informado';
    const feedbackText = feedback || '';
    console.log(`[AUTH] 🚫 User ${user.email} canceled. Reason: ${reasonText}. Feedback: ${feedbackText}`);

    // Send WhatsApp cancellation notification to the user
    try {
      const config = await prisma.systemConfig.findUnique({ where: { id: 'singleton' } });
      if (config?.komunikaAdminApiKey && config.komunikaInstanceId && user.phone) {
        const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
        let phone = user.phone.replace(/\D/g, '');
        if (phone.length === 9 && phone.startsWith('8')) phone = `258${phone}`;
        
        const cancelMsg = `Olá ${user.name?.split(' ')[0] || 'membro'}, sua assinatura do *Código Zero* foi cancelada com sucesso.\n\nSentimos sua falta! 😔\n\nSe quiser voltar a qualquer momento, é só renovar pelo link na plataforma.\n\nObrigado por ter feito parte da comunidade! 🤝`;
        
        await fetch(`${apiUrl}/api/v1/messages/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': config.komunikaAdminApiKey },
          body: JSON.stringify({ instanceId: config.komunikaInstanceId, to: phone, type: 'text', content: cancelMsg }),
        });
        console.log(`[AUTH] ✉️ Cancellation WhatsApp sent to ${phone}`);
      }
    } catch (whatsappErr) {
      console.error('[AUTH] WhatsApp notification failed (non-blocking):', whatsappErr);
    }

    return res.json({
      success: true,
      message: 'Assinatura cancelada com sucesso. Você ainda pode renovar a qualquer momento.',
    });
  } catch (error) {
    console.error('[AUTH] Cancel subscription error:', error);
    return res.status(500).json({ error: 'Erro ao cancelar assinatura' });
  }
});
// POST /api/auth/avatar — upload profile picture
router.post('/avatar', authMiddleware, (req: AuthRequest, res: Response) => {
  avatarUpload.single('avatar')(req, res, async (err: any) => {
    if (err) {
      const msg = err.message === 'Apenas imagens são permitidas'
        ? err.message
        : err.code === 'LIMIT_FILE_SIZE'
          ? 'Arquivo muito grande (máx 5MB)'
          : 'Erro no upload';
      return res.status(400).json({ error: msg });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Delete old avatar file if it was a local upload
    try {
      const currentUser = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (currentUser?.avatarUrl?.startsWith('/uploads/avatars/')) {
        const oldPath = path.join(__dirname, '..', '..', currentUser.avatarUrl);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    } catch {}

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatarUrl },
      select: { id: true, name: true, avatarUrl: true },
    });

    return res.json({ success: true, avatarUrl, user });
  });
});

// GET /api/auth/komunika-instances — fetch instances from Komunika API
router.get('/komunika-instances', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.komunikaApiKey) {
      return res.status(400).json({ error: 'API Key do Komunika não configurada' });
    }

    const apiUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
    const instRes = await fetch(`${apiUrl}/api/v1/instances`, {
      headers: { 'X-API-Key': user.komunikaApiKey },
    });

    if (!instRes.ok) {
      return res.status(instRes.status).json({ error: 'Erro ao conectar com Komunika. Verifique sua API Key.' });
    }

    const instData = await instRes.json();
    const rawInstances = instData?.data || (Array.isArray(instData) ? instData : []);

    // Map to a clean format
    const list = rawInstances.map((inst: any) => ({
      id: inst.id || inst.instanceId || inst.instanceName || inst.name,
      name: inst.name || inst.instanceName || 'Sem nome',
      status: inst.status || inst.connectionStatus || inst.state || 'unknown',
      owner: inst.phone || inst.owner || '',
    }));

    return res.json({ instances: list });
  } catch (error) {
    console.error('[AUTH] Komunika instances fetch error:', error);
    return res.status(500).json({ error: 'Não foi possível conectar ao Komunika' });
  }
});

// ── Push Notifications ──

// GET /api/auth/vapid-public-key
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

// POST /api/auth/push-subscribe
router.post('/push-subscribe', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { subscription } = req.body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: 'Subscription inválida' });
    }

    // Upsert — avoid duplicates by endpoint
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('[PUSH] Subscribe error:', error);
    return res.status(500).json({ error: 'Erro ao registrar push' });
  }
});

export default router;

// ── Helper: send push to a user ──
export async function sendPushToUser(userId: string, payload: { title: string; body: string; url?: string; icon?: string }) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@codigozero.app',
      process.env.VAPID_PUBLIC_KEY || '',
      process.env.VAPID_PRIVATE_KEY || '',
    );

    const subs = await prisma.pushSubscription.findMany({ where: { userId } });

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err: any) {
        // Remove expired subscriptions (410 Gone)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[PUSH] Send error:', e);
  }
}
// Helper: broadcast push to ALL users
export async function sendPushBroadcast(payload: { title: string; body: string; url?: string }) {
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@codigozero.app',
      process.env.VAPID_PUBLIC_KEY || '',
      process.env.VAPID_PRIVATE_KEY || '',
    );

    const allSubs = await prisma.pushSubscription.findMany();

    for (const sub of allSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }
  } catch (e) {
    console.error('[PUSH] Broadcast error:', e);
  }
}

// Helper: send push to all superadmins
export async function sendPushToSuperAdmins(payload: { title: string; body: string; url?: string }) {
  try {
    const admins = await prisma.user.findMany({ where: { role: 'superadmin' }, select: { id: true } });
    for (const admin of admins) {
      await sendPushToUser(admin.id, payload);
    }

    // Integração Pushcut para iPhone
    if (process.env.PUSHCUT_WEBHOOK_URL) {
      try {
        await fetch(process.env.PUSHCUT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: payload.title,
            text: payload.body,
          })
        });
      } catch (e) {
        console.error('[PUSHCUT] Delivery error:', e);
      }
    }
  } catch (e) {
    console.error('[PUSH] Superadmin push error:', e);
  }
}
