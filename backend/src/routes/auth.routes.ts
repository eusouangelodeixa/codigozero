import { isAllowedUpload } from '../lib/uploadGuards';
import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { optimizeImage } from '../lib/image';
import { env } from '../config/env';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { lojouService } from '../services/lojou.service';
import { getActivePrice } from '../lib/pricing';
import { createAndSendOtp, verifyOtp } from '../services/otp.service';
import { normalizeMzPhone } from '../lib/whatsapp';

import { signMembersSsoCode } from '../lib/membersSso';
import { generateUserPassword, sendCredentialsEmail, sendCredentialsViaWhatsApp, sendPasswordResetEmail } from '../services/payment.service';
import { signAuthToken } from '../lib/authToken';
import { verifyAutoLoginToken, signAutoLoginToken } from '../lib/autoLoginToken';
import {
  sendPushToUser,
  sendPushToUsers,
  sendPushBroadcast,
  sendPushToSuperAdmins,
} from '../services/push.service';
import { hasAnyCourseAccess } from '../services/courseAccess.service';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// "Parse or 400" — run a Zod schema against the request body and, on failure,
// reply 400 with the first issue's message (already in PT, matching the manual
// checks these schemas replace). Returns the typed data on success, or null
// after sending the response (the caller must `return` when it gets null).
function parseOr400<S extends z.ZodTypeAny>(req: Request, res: Response, schema: S): z.infer<S> | null {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const msg = result.error.issues[0]?.message || 'Dados inválidos';
    res.status(400).json({ error: msg });
    return null;
  }
  return result.data;
}

// Subscription statuses that count as "has/had a paid plan". Anything else —
// notably 'lead' (a never-paid signup or a refunded account) or an empty/unknown
// status — is NOT a customer: it must never log in, recover access, or receive a
// recovery code. Roles below bypass this (they don't hold a member subscription).
const PAID_STATUSES = ['active', 'grace_period', 'overdue', 'canceled'];
const PRIVILEGED_ROLES = ['admin', 'superadmin', 'coproducer'];
const isPaidSubscriber = (status?: string | null) => !!status && PAID_STATUSES.includes(status);

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
    if (isAllowedUpload(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens (JPG, PNG, WEBP, GIF) são permitidas'));
  },
});

// Throttle login: at most 5 attempts / 15 min per IP, to blunt credential
// stuffing / brute force. Mirrors recoverLimiter / otpLimiter below.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Aguarde alguns minutos e tente de novo.' },
});

// Login: email + password both required (non-empty). Email is kept as a free
// string — NOT format-validated — so we don't start rejecting logins that the
// current `!email || !password` check accepts. The PT message is reused for both
// the type and the empty-string case so the response never changes shape.
const loginCredential = (label: string) =>
  z.string({ required_error: label, invalid_type_error: label }).min(1, label);
const loginSchema = z.object({
  email: loginCredential('Email e senha são obrigatórios'),
  password: loginCredential('Email e senha são obrigatórios'),
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const body = parseOr400(req, res, loginSchema);
    if (!body) return;
    const { email, password } = body;

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

    // Never issue a token to a non-customer. Leads (form signups that never
    // paid) are created with role=member + isActive=true, so without this gate
    // they could authenticate and only hit the paywall deeper in the app. Paid
    // statuses (incl. overdue/canceled) still log in so they can reach /blocked
    // and renew. Admin/superadmin/coproducer don't hold a member subscription.
    // Excepção: quem comprou um curso avulso, ou ganhou acesso vitalício numa
    // turma, não tem assinatura nenhuma — e mesmo assim TEM de conseguir
    // entrar, senão o direito que lhe vendemos fica inacessível.
    const temCurso =
      !PRIVILEGED_ROLES.includes(user.role) && !isPaidSubscriber(user.subscriptionStatus)
        ? await hasAnyCourseAccess(user.id)
        : false;

    if (!PRIVILEGED_ROLES.includes(user.role) && !isPaidSubscriber(user.subscriptionStatus) && !temCurso) {
      return res.status(403).json({
        error: 'Esta conta ainda não tem uma assinatura ativa. Conclua o pagamento para liberar o acesso à plataforma.',
      });
    }

    const token = signAuthToken(user.id, user.tokenVersion);

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
        // Tem acesso à PLATAFORMA (app: Radar, Disparador, …)? Assinante ou
        // papel privilegiado sim; comprador só de curso NÃO — esse é mandado
        // direto pra área de membros (senão cairia num dashboard bloqueado).
        hasPlatformAccess: PRIVILEGED_ROLES.includes(user.role) || isPaidSubscriber(user.subscriptionStatus),
      },
    });
  } catch (error) {
    console.error('[AUTH] Login error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/auto-login — troca o token do botão "Acessar meu produto"
// (e-mail de credenciais) por um JWT normal, já logando a pessoa. Trocado por
// POST de propósito (scanners de e-mail fazem GET e não disparam isto).
router.post('/auto-login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '');
    const v = token ? verifyAutoLoginToken(token) : null;
    if (!v) return res.status(401).json({ error: 'Link inválido ou expirado. Entre com e-mail e senha.' });

    const user = await prisma.user.findUnique({ where: { id: v.userId } });
    if (!user || !user.isActive) return res.status(401).json({ error: 'Conta indisponível.' });
    // Link morre se a senha foi trocada depois do envio (mesma revogação da sessão).
    if ((v.tv ?? 0) !== user.tokenVersion) {
      return res.status(401).json({ error: 'Este link expirou (a senha foi alterada). Entre com e-mail e senha.' });
    }
    // Mesmo portão do login: assinante pago, ou dono de curso, ou papel privilegiado.
    const podeEntrar =
      PRIVILEGED_ROLES.includes(user.role) ||
      isPaidSubscriber(user.subscriptionStatus) ||
      (await hasAnyCourseAccess(user.id));
    if (!podeEntrar) {
      return res.status(403).json({ error: 'Esta conta ainda não tem acesso ativo.' });
    }

    const authToken = signAuthToken(user.id, user.tokenVersion);
    return res.json({
      token: authToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
        avatarUrl: user.avatarUrl,
        hasCompletedOnboarding: user.hasCompletedOnboarding,
        hasPlatformAccess: PRIVILEGED_ROLES.includes(user.role) || isPaidSubscriber(user.subscriptionStatus),
      },
    });
  } catch (error) {
    console.error('[AUTH] auto-login error:', error);
    return res.status(500).json({ error: 'Erro ao entrar. Tente com e-mail e senha.' });
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

    // Primeiro acesso: só CARIMBAMOS firstAccessAt (sinal de "acessou" que o
    // painel do admin mostra). O WhatsApp de boas-vindas foi REMOVIDO — com
    // importações de turma em massa, um envio automático no primeiro acesso é
    // risco de ban do número compartilhado, e ainda prometia Radar/Disparador
    // a quem comprou só um curso. O acesso já é entregue por e-mail; o painel
    // registra que a pessoa entrou.
    if (user.role === 'member' && !user.firstAccessAt) {
      const accessedAt = new Date();
      await prisma.user.update({ where: { id: user.id }, data: { firstAccessAt: accessedAt } });
      user.firstAccessAt = accessedAt;
    }

    // Whether the embedded Komunika module is provisioned and active for this
    // user — gates the "Abrir Komunika" SSO button on the frontend.
    const komunikaActive = !!user.komunikaCompanyId && !user.komunikaDeprovisionedAt;

    // Offboarded sócio (withdraw-only): the frontend uses this to confine the
    // user to the saque screen. Cheap indexed lookup; null for ~all users.
    const pa = await prisma.partnerAccount.findUnique({
      where: { userId: user.id },
      select: { withdrawOnly: true },
    });

    return res.json({ user: { ...user, komunikaActive, withdrawOnly: !!pa?.withdrawOnly } });
  } catch (error) {
    console.error('[AUTH] Get me error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/members-sso — minta o código de uso único (60s) que o botão
// "Área de Membros" usa para entrar logado em members.czero.sbs (outra
// origem — localStorage não cruza). O app navega para
// https://members.czero.sbs/sso#code=… e a página /sso troca o código pelo
// JWT via POST /api/members/sso/exchange.
router.post('/members-sso', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    return res.json({ code: signMembersSsoCode(req.user!.id) });
  } catch (error) {
    console.error('[AUTH] members-sso mint error:', error);
    return res.status(500).json({ error: 'Erro ao gerar acesso' });
  }
});

// GET /api/auth/app-link?to=/perfil — devolve uma URL do APP já autenticada
// (via auto-login) para abrir uma página do app a partir de OUTRA origem — ex.:
// a área de membros (members.czero.sbs) abrindo o /perfil (app.czero.sbs) numa
// nova aba, já logado. localStorage não cruza origens, por isso a ponte.
router.get('/app-link', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const rawTo = typeof req.query.to === 'string' ? req.query.to : '/dashboard';
    const to = /^\/(?![/\\])/.test(rawTo) ? rawTo : '/dashboard'; // só caminho interno
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { tokenVersion: true } });
    const token = signAutoLoginToken(req.user!.id, u?.tokenVersion ?? 0);
    const base = env.FRONTEND_URL || 'https://app.czero.sbs';
    return res.json({ url: `${base}/login?al=${encodeURIComponent(token)}&to=${encodeURIComponent(to)}` });
  } catch (error) {
    console.error('[AUTH] app-link error:', error);
    return res.status(500).json({ error: 'Erro ao gerar link' });
  }
});

/**
 * GET /api/auth/subscription-portal — gateway-native subscription management
 * URL for the current member ("Gerir assinatura" na página /assinatura).
 *
 * Fase 1 (Lojou / M-Pesa): a própria Lojou entrega uma página de gestão pronta
 * no payload do webhook — `plan_subscriber.portal_url` (pausar / cancelar /
 * recibo) — que fica guardada no Transaction.metadata. Lemos da transação mais
 * recente do cliente que a carrega. (Fase 2 adiciona o Stripe Billing Portal
 * para membros com `stripeCustomerId`.)
 */
router.get('/subscription-portal', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, phone: true, subscriptionStatus: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Um 'lead' nunca concluiu compra (a transação fica 'pending' = venda
    // cancelada), então não há assinatura pra gerir — não expõe portal mesmo
    // que exista um portal_url no metadata de um checkout iniciado.
    if (user.subscriptionStatus === 'lead') return res.json({ provider: null, url: null });

    const orClauses = [
      ...(user.email ? [{ userEmail: user.email }] : []),
      ...(user.phone ? [{ userPhone: user.phone }] : []),
    ];
    if (orClauses.length === 0) return res.json({ provider: null, url: null });

    // Varre as transações recentes e devolve o primeiro portal_url encontrado.
    const txs = await prisma.transaction.findMany({
      where: { OR: orClauses },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { metadata: true },
    });
    for (const t of txs) {
      const sub = (t.metadata as any)?.plan_subscriber;
      if (sub?.portal_url) {
        return res.json({
          provider: 'lojou',
          url: String(sub.portal_url),
          subscription: {
            planName: sub.plan_name ?? null,
            status: sub.status ?? null,
            nextRenewal: sub.end_date ?? null,
            cancelledAt: sub.cancelled_at ?? null,
          },
        });
      }
    }
    return res.json({ provider: null, url: null });
  } catch (error) {
    console.error('[AUTH] subscription-portal error:', error);
    return res.status(500).json({ error: 'Erro ao obter portal de assinatura' });
  }
});

/**
 * GET /api/auth/payment-history — pagamentos aprovados do membro, com link de
 * recibo por pagamento. Cada linha: data, valor, moeda, referência
 * (order_number), gateway e o `receiptUrl` (aba `receipt` da página do pedido
 * na Lojou, montado a partir de order_number + transaction_id do metadata do
 * webhook). Stripe ainda não expõe recibo aqui (receiptUrl = null).
 */
router.get('/payment-history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { email: true, phone: true },
    });
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    const orClauses = [
      ...(user.email ? [{ userEmail: user.email }] : []),
      ...(user.phone ? [{ userPhone: user.phone }] : []),
    ];
    if (orClauses.length === 0) return res.json({ payments: [] });

    const txs = await prisma.transaction.findMany({
      where: { OR: orClauses, status: 'approved' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        orderId: true, amount: true, currency: true, gateway: true,
        isRenewal: true, paymentMethod: true, createdAt: true, metadata: true,
      },
    });

    const payments = txs.map((t) => {
      const meta = (t.metadata as any) || {};
      const transactionId = meta.transaction_id || meta.data?.transaction_id || null;
      const orderNumber = t.orderId;
      const isLojou = !t.gateway || t.gateway === 'lojou';
      const receiptUrl =
        isLojou && transactionId
          ? `https://pay.lojou.app/order/${encodeURIComponent(orderNumber)}?transaction_id=${encodeURIComponent(transactionId)}&tab=receipt`
          : null;
      return {
        date: t.createdAt,
        amount: t.amount,
        currency: t.currency || 'MZN',
        reference: orderNumber,
        gateway: t.gateway || 'lojou',
        isRenewal: t.isRenewal,
        paymentMethod: t.paymentMethod || null,
        receiptUrl,
      };
    });

    return res.json({ payments });
  } catch (error) {
    console.error('[AUTH] payment-history error:', error);
    return res.status(500).json({ error: 'Erro ao obter histórico de pagamentos' });
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

// Limite POR IDENTIFICADOR (além do por-IP): impede que alguém que saiba o
// telefone/e-mail da vítima fique redefinindo a senha dela em looping (o
// per-IP não protege alvo único). 3 por hora por alvo.
const recoverPerIdentifierLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String((req.body?.identifier ?? '')).trim().toLowerCase().replace(/\D/g, (c) => c) || 'none',
  message: { error: 'Muitas tentativas para este contato. Aguarde e tente mais tarde.' },
});

const recoverAccessSchema = z.object({
  identifier: z
    .preprocess((v) => String(v ?? '').trim(), z.string())
    .refine((s) => s.length > 0, { message: 'Informe o telefone ou e-mail usado na compra.' }),
});

// Resposta SEMPRE uniforme — não revela se o contato é (ou não) de um cliente,
// e NUNCA devolve a senha no corpo (isso era o vetor de tomada de conta: saber
// o telefone/e-mail — semi-públicos — bastava para redefinir e ver a senha na
// tela). O novo acesso é entregue apenas nos canais JÁ CADASTRADOS (e-mail
// confiável + WhatsApp), que só o dono real controla.
const RECOVER_GENERIC = {
  ok: true,
  message:
    'Se estes dados forem de uma compra ativa, enviámos o seu acesso para o e-mail e o WhatsApp cadastrados. Verifique lá.',
};

/** Mascara e-mail: mantém 1ª letra do usuário + domínio. d••••@gmail.com */
function maskEmail(email?: string | null): string | null {
  const e = (email || '').trim();
  if (!e || !e.includes('@') || e.endsWith('@lead.czero.sbs')) return null;
  const [local, domain] = e.split('@');
  const head = local.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(3, local.length - 1))}@${domain}`;
}

/** Mascara telefone p/ dica do resgate: mantém os 2 últimos dígitos, e devolve
 *  null para telefones-placeholder. (O maskPhone do fluxo de OTP, mais abaixo,
 *  não trata esses casos, por isso este é separado.) */
function maskRecoverPhone(phone?: string | null): string | null {
  const d = (phone || '').replace(/\D/g, '');
  if (!d || d.length < 6 || (phone || '').startsWith('sem_telefone') || (phone || '').startsWith('turma_')) return null;
  const last = d.slice(-2);
  return `${'•'.repeat(Math.max(4, d.length - 2))}${last}`;
}

router.post('/recover-access', recoverLimiter, recoverPerIdentifierLimiter, async (req: Request, res: Response) => {
  try {
    const body = parseOr400(req, res, recoverAccessSchema);
    if (!body) return;
    const identifier = body.identifier;

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

    // Só entrega para um cliente real: role=member + (assinatura paga OU curso).
    // Qualquer outro caso responde o MESMO texto genérico (sem enumeração).
    const assinantePago = !!user && user.role === 'member' && isPaidSubscriber(user.subscriptionStatus);
    const temCurso = !!user && user.role === 'member' && (await hasAnyCourseAccess(user.id));
    if (!user || !user.isActive || user.role !== 'member' || (!assinantePago && !temCurso)) {
      return res.json(RECOVER_GENERIC);
    }

    const acessos = await prisma.courseAccess.findMany({
      where: { userId: user.id, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { course: { select: { name: true } } },
    });

    // Redefine e ENTREGA nos canais cadastrados — nunca no corpo da resposta.
    // Bump do tokenVersion → sessões antigas caem (se a conta estava tomada).
    const { raw, hash } = await generateUserPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, accessRevealedAt: new Date(), tokenVersion: { increment: 1 } },
    });
    console.log(`[AUTH] 🔓 Acesso reenviado via /resgate para user=${user.id} (canais cadastrados)`);

    // Nomeia o que a pessoa tem, pra mensagem não vir genérica: assinante →
    // "Código Zero"; 1 curso → o nome do curso; vários → "seus cursos".
    const productName = assinantePago
      ? 'Código Zero'
      : acessos.length === 1
        ? acessos[0].course.name
        : acessos.length > 1
          ? 'seus cursos'
          : undefined;
    sendCredentialsEmail({ name: user.name, email: user.email, rawPassword: raw, productName, userId: user.id }).catch((e) =>
      console.error('[AUTH] recover-access e-mail falhou (não-bloqueante):', e?.message || e),
    );
    if (user.phone && !user.phone.startsWith('sem_telefone') && !user.phone.startsWith('turma_')) {
      let cleanPhone = user.phone.replace(/\D/g, '');
      if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) cleanPhone = `258${cleanPhone}`;
      sendCredentialsViaWhatsApp({ phone: cleanPhone, email: user.email, rawPassword: raw, productName }).catch((e) =>
        console.error('[AUTH] recover-access whatsapp falhou (não-bloqueante):', e?.message || e),
      );
    }

    // Dicas MASCARADAS dos destinos, pra pessoa saber ONDE conferir (padrão de
    // banco/Google). Só para o cliente real — o caso "não encontrado" acima já
    // devolveu o genérico sem dicas.
    return res.json({
      ...RECOVER_GENERIC,
      emailHint: maskEmail(user.email),
      phoneHint: maskRecoverPhone(user.phone),
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
      // bump da versão → todas as sessões antigas caem (revogação).
      data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } },
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
const checkEmailSchema = z.object({
  email: z
    .preprocess((v) => String(v ?? '').trim(), z.string())
    .refine((s) => s.length > 0, { message: 'Informe o e-mail.' }),
});

router.post('/forgot-password/check-email', otpLimiter, async (req: Request, res: Response) => {
  try {
    const body = parseOr400(req, res, checkEmailSchema);
    if (!body) return;
    const email = body.email;

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
// email + phone both required. Keys are declared email-first so the first
// reported issue matches the original sequential checks (email before phone).
const forgotRequestSchema = z.object({
  email: z
    .preprocess((v) => String(v ?? '').trim(), z.string())
    .refine((s) => s.length > 0, { message: 'Informe o e-mail.' }),
  phone: z
    .preprocess((v) => String(v ?? '').trim(), z.string())
    .refine((s) => s.length > 0, { message: 'Informe o número de WhatsApp.' }),
});

router.post('/forgot-password/request', otpLimiter, async (req: Request, res: Response) => {
  try {
    const body = parseOr400(req, res, forgotRequestSchema);
    if (!body) return;
    const email = body.email;
    const phoneRaw = body.phone;

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
// Mirrors the original two-step check: (1) email/code/newPassword must all be
// present (truthy) → one combined message; (2) newPassword (stringified) must be
// ≥6 chars. Coercion via String(...) matches the legacy handler so e.g. a numeric
// `code` is still accepted. The shape stays loose on purpose.
const forgotResetSchema = z
  .object({
    email: z.any(),
    code: z.any(),
    newPassword: z.any(),
  })
  .superRefine((v, ctx) => {
    if (!v.email || !v.code || !v.newPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Preencha e-mail, código e nova senha.' });
      return; // don't also fire the length message when something is missing
    }
    if (String(v.newPassword).length < 6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }
  });

router.post('/forgot-password/reset', async (req: Request, res: Response) => {
  try {
    const body = parseOr400(req, res, forgotResetSchema);
    if (!body) return;
    const { email, code, newPassword } = body;

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
      data: { passwordHash: await bcrypt.hash(String(newPassword), 10), tokenVersion: { increment: 1 } },
    });

    return res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao redefinir senha' });
  }
});

// ── EMAIL-based password recovery ───────────────────────────────────────────
// A second, self-service recovery channel ALONGSIDE the WhatsApp/OTP flow above
// (which is untouched). The user requests a link by e-mail; we mail a single-use,
// ~1h token and let them set a new password on /recuperar. The raw token lives
// only in the e-mailed link — we persist sha256(token) so a DB leak is useless.
const emailRecoverLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// email-request: just a non-empty (trimmed) e-mail. Format intentionally NOT
// enforced so the generic anti-enumeration response keeps working as today.
const emailRequestSchema = z.object({
  email: z
    .preprocess((v) => String(v ?? '').trim(), z.string())
    .refine((s) => s.length > 0, { message: 'Informe o e-mail.' }),
});

// email-reset: token (trimmed, non-empty) + newPassword (≥6 chars). Coercion
// matches the legacy String(...) handling so the de-facto contract is preserved.
const emailResetSchema = z
  .object({
    token: z.preprocess((v) => String(v ?? '').trim(), z.string()),
    newPassword: z.preprocess((v) => String(v ?? ''), z.string()),
  })
  .superRefine((v, ctx) => {
    if (!v.token || !v.newPassword) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Token e nova senha são obrigatórios.' });
      return;
    }
    if (v.newPassword.length < 6) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A nova senha deve ter pelo menos 6 caracteres.' });
    }
  });

// POST /api/auth/forgot-password/email-request { email }
// Sends a reset link IF the e-mail belongs to a paid customer. ALWAYS returns a
// generic success (no user enumeration): the response is identical whether or
// not an account exists, so callers can't probe which e-mails are registered.
router.post('/forgot-password/email-request', emailRecoverLimiter, async (req: Request, res: Response) => {
  const genericOk = () =>
    res.json({
      success: true,
      message: 'Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.',
    });
  try {
    const parsed = emailRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Informe o e-mail.' });
    }
    const email = parsed.data.email;

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, email: true, isActive: true, role: true, subscriptionStatus: true },
    });

    // Only mint a token for a real, active customer. Anything else → same
    // generic response (don't disclose existence/eligibility). Privileged roles
    // (admin/superadmin/coproducer) are eligible too — they don't hold a member
    // subscription but must still be able to recover their own login.
    const eligible =
      !!user &&
      user.isActive &&
      (PRIVILEGED_ROLES.includes(user.role) || isPaidSubscriber(user.subscriptionStatus));

    if (eligible && user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      const base = env.FRONTEND_URL || 'https://app.czero.sbs';
      const resetUrl = `${base}/recuperar?token=${rawToken}`;
      // Non-blocking: a delivery hiccup must not change the response shape
      // (otherwise timing/HTTP differences would leak whether the user exists).
      sendPasswordResetEmail({ name: user.name, email: user.email, resetUrl }).catch((e) =>
        console.error('[AUTH] password-reset e-mail failed (non-blocking):', e?.message || e),
      );
      console.log(`[AUTH] 🔗 Password reset link issued for user=${user.id}`);
    }

    return genericOk();
  } catch (error) {
    console.error('[AUTH] email-request error:', error);
    // Even on error, stay generic so failures can't be used to enumerate users.
    return genericOk();
  }
});

// POST /api/auth/forgot-password/email-reset { token, newPassword }
// Redeems a token from the e-mail link: must exist, not be expired, not be used.
// On success, sets the new password (bcrypt) and marks the token used. Errors are
// generic ("inválido ou expirado") so a probed token reveals nothing.
router.post('/forgot-password/email-reset', emailRecoverLimiter, async (req: Request, res: Response) => {
  try {
    const body = parseOr400(req, res, emailResetSchema);
    if (!body) return;
    const token = body.token;
    const newPassword = body.newPassword;

    const record = await prisma.passwordResetToken.findFirst({
      where: { tokenHash: sha256(token) },
    });

    // Single-use + time-boxed. Same generic message for missing/expired/used so
    // the endpoint can't be used to learn which tokens are valid.
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await bcrypt.hash(newPassword, 10), tokenVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    console.log(`[AUTH] 🔑 Password reset via e-mail link for user=${record.userId}`);
    return res.json({ success: true, message: 'Senha redefinida com sucesso. Faça login com a nova senha.' });
  } catch (error) {
    console.error('[AUTH] email-reset error:', error);
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

    // Optimize the avatar in place: EXIF-rotate, fit within 512px, re-encode to
    // webp. Failure-tolerant — on any sharp error we keep the original upload
    // and serve it as-is (optimizeImage returns null, filename stays the same).
    let filename = req.file.filename;
    const optimized = await optimizeImage(req.file.path, { maxDim: 512, format: 'webp' });
    if (optimized) filename = optimized.filename;

    const avatarUrl = `/uploads/avatars/${filename}`;

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
