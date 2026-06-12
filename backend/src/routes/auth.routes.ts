import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { lojouService } from '../services/lojou.service';
import { getActivePrice } from '../lib/pricing';
import { createAndSendOtp, verifyOtp } from '../services/otp.service';
import { normalizeMzPhone } from '../lib/whatsapp';
import { sendFirstAccessWelcome } from '../services/onboarding.service';
import { generateUserPassword } from '../services/payment.service';
import {
  sendPushToUser,
  sendPushToUsers,
  sendPushBroadcast,
  sendPushToSuperAdmins,
} from '../services/push.service';

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
        komunikaCompanyId: true,
        komunikaDeprovisionedAt: true,
        avatarUrl: true,
        hasCompletedOnboarding: true,
        closeFriends: true,
        closeFriendsUntil: true,
        firstAccessAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // First-access onboarding: the first time a paying member opens the app we
    // stamp firstAccessAt (authoritative "they accessed" signal — stops the
    // onboarding nudges) and fire a one-time welcome WhatsApp. Cheap guard: the
    // branch only runs until firstAccessAt is set, then never again.
    if (user.role === 'member' && !user.firstAccessAt) {
      const accessedAt = new Date();
      await prisma.user.update({ where: { id: user.id }, data: { firstAccessAt: accessedAt } });
      user.firstAccessAt = accessedAt;
      sendFirstAccessWelcome(user.id).catch((e) =>
        console.error('[ONBOARDING] welcome dispatch failed (non-blocking):', e?.message || e),
      );
    }

    // Whether the embedded Komunika module is provisioned and active for this
    // user — gates the "Abrir Komunika" SSO button on the frontend.
    const komunikaActive = !!user.komunikaCompanyId && !user.komunikaDeprovisionedAt;

    return res.json({ user: { ...user, komunikaActive } });
  } catch (error) {
    console.error('[AUTH] Get me error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ── Access-recovery fallback (/resgate) ─────────────────────────────────────
// When WhatsApp delivery fails, a buyer can recover their access on screen by
// entering the phone/e-mail used in the purchase. The password is stored only
// hashed, so we RESET it to a fresh one and show it ONCE — guarded by
// accessRevealedAt so it can never be revealed again (the page warns the user).
const recoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

router.post('/recover-access', recoverLimiter, async (req: Request, res: Response) => {
  try {
    const identifier = String(req.body?.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ error: 'Informe o telefone ou e-mail usado na compra.' });
    }

    let user = null;
    if (identifier.includes('@')) {
      user = await prisma.user.findFirst({
        where: { email: { equals: identifier, mode: 'insensitive' } },
      });
    } else {
      const norm = normalizeMzPhone(identifier);
      const digits = identifier.replace(/\D/g, '');
      user = await prisma.user.findFirst({ where: { OR: [{ phone: norm }, { phone: digits }] } });
    }

    if (!user || user.role !== 'member') {
      return res.status(404).json({
        error: 'Não encontramos uma compra com esses dados. Confira o telefone ou e-mail que usou na compra.',
      });
    }
    if (!user.isActive) {
      return res.status(403).json({
        error: 'Sua assinatura não está ativa no momento. Fale com o suporte para recuperar o acesso.',
      });
    }
    if (user.accessRevealedAt) {
      return res.status(409).json({
        error:
          'Seus dados de acesso já foram exibidos uma vez por aqui. Por segurança não mostramos novamente — fale com o suporte se precisar.',
        alreadyRevealed: true,
      });
    }

    const { raw, hash } = await generateUserPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, accessRevealedAt: new Date() },
    });

    console.log(`[AUTH] 🔓 Access revealed on /resgate for user=${user.id}`);
    return res.json({
      name: user.name,
      email: user.email,
      password: raw,
      loginUrl: `${env.FRONTEND_URL || 'https://app.czero.sbs'}/login`,
    });
  } catch (error) {
    console.error('[AUTH] recover-access error:', error);
    return res.status(500).json({ error: 'Erro ao recuperar acesso. Tente novamente.' });
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

// Limit OTP requests: at most 4 per 10 minutes per IP, to curb abuse/cost.
const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 4,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas solicitações de código. Tente novamente em alguns minutos.' },
});

// Subscription statuses that count as "has/had a paid plan". Anything else —
// notably 'lead' (a never-paid signup or a refunded account) or an empty/unknown
// status — is NOT eligible for password recovery. We must NEVER send a recovery
// code to someone without a plan.
const PAID_STATUSES = ['active', 'grace_period', 'overdue', 'canceled'];
const isPaidSubscriber = (status?: string | null) => !!status && PAID_STATUSES.includes(status);
// Mask all but the last 2 digits, e.g. "258841234567" -> "••••••••••67".
const maskPhone = (phone: string) => phone.replace(/\d(?=\d{2})/g, '•');

// POST /api/auth/password/request-otp — send a WhatsApp code to confirm a
// password change in /perfil. Code is delivered to the user's saved phone.
router.post('/password/request-otp', authMiddleware, otpLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (!user.phone) return res.status(400).json({ error: 'Nenhum telefone cadastrado no seu perfil.' });

    const { sent } = await createAndSendOtp({ phone: user.phone, purpose: 'password_change', userId: user.id });
    if (!sent) return res.status(502).json({ error: 'Não foi possível enviar o código pelo WhatsApp. Tente novamente.' });

    // Hint the masked phone so the user knows where the code went.
    const masked = user.phone.replace(/\d(?=\d{2})/g, '•');
    return res.json({ success: true, phoneHint: masked });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao enviar código' });
  }
});

// PATCH /api/auth/password — change own password (requires current password
// + a WhatsApp OTP confirming the change).
router.patch('/password', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, code } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Preencha ambos os campos.' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
    if (!code) return res.status(400).json({ error: 'Informe o código enviado no seu WhatsApp.' });

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Senha atual incorreta.' });

    const otp = await verifyOtp({ phone: user.phone, purpose: 'password_change', code });
    if (!otp.valid) return res.status(401).json({ error: 'Código inválido ou expirado.' });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    return res.json({ success: true, message: 'Senha atualizada com sucesso.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

// POST /api/auth/forgot-password/check-email — STEP 1 of recovery.
// Confirms the e-mail belongs to a PAID account before anything is unlocked.
// Returns { subscriber:true, phoneHint } so the front-end can reveal the
// WhatsApp field, or { subscriber:false } so it shows the "tornar-se assinante"
// CTA. NEVER sends a code (that only happens in /request, after the phone match).
router.post('/forgot-password/check-email', otpLimiter, async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Informe o e-mail.' });

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { subscriptionStatus: true, phone: true },
    });

    // No account, or an account without a paid plan → not a subscriber.
    if (!user || !isPaidSubscriber(user.subscriptionStatus)) {
      return res.json({ subscriber: false });
    }
    // Paid, but no phone on file → can't deliver a WhatsApp code.
    if (!user.phone) {
      return res.json({ subscriber: true, phoneHint: null, noPhone: true });
    }
    return res.json({ subscriber: true, phoneHint: maskPhone(user.phone) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao verificar e-mail' });
  }
});

// POST /api/auth/forgot-password/request — STEP 2: send the WhatsApp code.
// Requires { email, phone }. The account must be a paid subscriber AND the
// number must match the one registered on it. Any other case → no code is sent.
router.post('/forgot-password/request', otpLimiter, async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim();
    const phoneRaw = String(req.body?.phone || '').trim();
    if (!email) return res.status(400).json({ error: 'Informe o e-mail.' });
    if (!phoneRaw) return res.status(400).json({ error: 'Informe o número de WhatsApp.' });

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, phone: true, subscriptionStatus: true },
    });

    // Not a paying customer → block and signal the front-end to show the CTA.
    if (!user || !isPaidSubscriber(user.subscriptionStatus)) {
      return res.status(403).json({ error: 'Este e-mail não está vinculado a um plano pago.', notSubscriber: true });
    }
    if (!user.phone) {
      return res.status(400).json({ error: 'Nenhum WhatsApp cadastrado nesta conta. Fale com o suporte.' });
    }
    // The number must match the one on file (compare normalized digits).
    if (normalizeMzPhone(phoneRaw) !== normalizeMzPhone(user.phone)) {
      return res.status(400).json({ error: 'Este número não corresponde ao WhatsApp cadastrado nesta conta.' });
    }

    const { sent } = await createAndSendOtp({ phone: user.phone, purpose: 'password_reset', userId: user.id });
    if (!sent) return res.status(502).json({ error: 'Não foi possível enviar o código pelo WhatsApp. Tente novamente.' });
    return res.json({ success: true, message: 'Enviamos um código pelo WhatsApp.', phoneHint: maskPhone(user.phone) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao solicitar recuperação' });
  }
});

// POST /api/auth/forgot-password/reset — STEP 3: confirm code + set new password.
// Re-checks the subscriber gate so a code can never be redeemed on a non-paid account.
router.post('/forgot-password/reset', async (req: Request, res: Response) => {
  try {
    const { email, code, newPassword } = req.body || {};
    if (!email || !code || !newPassword) return res.status(400).json({ error: 'Preencha e-mail, código e nova senha.' });
    if (String(newPassword).length < 6) return res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });

    const user = await prisma.user.findFirst({
      where: { email: { equals: String(email).trim(), mode: 'insensitive' } },
      select: { id: true, phone: true, subscriptionStatus: true },
    });
    if (!user || !isPaidSubscriber(user.subscriptionStatus) || !user.phone) {
      return res.status(400).json({ error: 'Código inválido ou expirado.' });
    }

    const otp = await verifyOtp({ phone: user.phone, purpose: 'password_reset', code: String(code) });
    if (!otp.valid) return res.status(400).json({ error: 'Código inválido ou expirado.' });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(String(newPassword), 10) },
    });

    return res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// POST /api/auth/pwa-installed — mark that the app is running standalone
// (added to the home screen). Idempotent: only stamps the first time. The
// daily cron uses this to decide who still needs an install nudge.
router.post('/pwa-installed', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { pwaInstalledAt: true } });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (!user.pwaInstalledAt) {
      await prisma.user.update({ where: { id: req.user!.id }, data: { pwaInstalledAt: new Date() } });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao registrar instalação' });
  }
});

// GET /api/auth/notification-prefs — current per-channel toggles.
router.get('/notification-prefs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { notifyCommunity: true, notifyPromotions: true, notifySystem: true, notifyExpiration: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    return res.json({ prefs: user });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao carregar preferências' });
  }
});

// PATCH /api/auth/notification-prefs — update the toggles the user controls.
router.patch('/notification-prefs', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const data: Record<string, boolean> = {};
    for (const key of ['notifyCommunity', 'notifyPromotions', 'notifySystem', 'notifyExpiration'] as const) {
      if (typeof req.body?.[key] === 'boolean') data[key] = req.body[key];
    }
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { notifyCommunity: true, notifyPromotions: true, notifySystem: true, notifyExpiration: true },
    });
    return res.json({ prefs: user });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao salvar preferências' });
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

    if (!env.LOJOU_API_KEY) {
      return res.json({ offer: null, message: 'Gateway não configurado' });
    }

    // 2. Criar cupão na Lojou
    const code = `FICA10_${user.id.slice(0, 6).toUpperCase()}`;
    let checkoutUrl = '';
    let couponReady = false;

    try {
      await lojouService.createDiscount({
        code,
        type: 'percentage',
        value: 10,
        uses_limit: 1,
        single_use: true,
        status: 'active',
      });
      couponReady = true;
      console.log(`[RETENTION] ✅ Coupon ${code} created for ${user.email}`);
    } catch (e: any) {
      // 409 means the coupon already exists — treat as ready.
      if (typeof e?.message === 'string' && e.message.includes('(409)')) {
        couponReady = true;
        console.log(`[RETENTION] ↩ Coupon ${code} already existed, reusing for ${user.email}`);
      } else {
        console.warn('[RETENTION] Lojou discount API error:', e?.message || e);
      }
    }

    if (couponReady) {
      try {
        // 3. Gerar novo Checkout Link com o cupão aplicado
        const orderData = await lojouService.createOrder({
          amount: await getActivePrice(),
          product_pid: env.LOJOU_PRODUCT_PID,
          plan_id: env.LOJOU_PLAN_ID,
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
      } catch (e: any) {
        console.warn('[RETENTION] Lojou createOrder error:', e?.message || e);
      }
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

// POST /api/auth/push-test — send a self-test notification to the caller
router.post('/push-test', authMiddleware, async (req: AuthRequest, res: Response) => {
  const result = await sendPushToUser(req.user!.id, {
    title: '🧪 Teste de notificação',
    body: 'Funcionou! Suas notificações do Código Zero estão ativas.',
    url: '/perfil',
  });
  if (result.attempted === 0) {
    return res.status(404).json({
      success: false,
      error: 'Nenhuma assinatura push registrada neste dispositivo. Ative as notificações primeiro.',
      ...result,
    });
  }
  return res.json({ success: result.delivered > 0, ...result });
});

export default router;

// Re-export push helpers for legacy import paths (chat / admin / cron / webhook)
export { sendPushToUser, sendPushToUsers, sendPushBroadcast, sendPushToSuperAdmins };
