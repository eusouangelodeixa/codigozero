import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { subscriptionMiddleware } from '../middlewares/subscription.middleware';
import {
  AFFILIATE_RULES,
  AFFILIATE_PRODUCT,
  generateUniqueAffiliateCode,
  getAffiliateBalance,
  quoteWithdrawal,
  requestWithdrawal,
} from '../services/affiliate.service';
import { sendPushToSuperAdmins } from './auth.routes';

const router = Router();
const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────
// PUBLIC — resolve an affiliate code (used by /r/[code] landing route)
// ─────────────────────────────────────────────────────────────────────────
router.get('/resolve/:code', async (req: Request, res: Response) => {
  try {
    const code = req.params.code?.trim();
    if (!code) return res.status(400).json({ error: 'Código inválido' });

    const account = await prisma.affiliateAccount.findUnique({
      where: { code },
      include: { user: { select: { name: true } } },
    });
    if (!account || !account.enabled) {
      return res.status(404).json({ error: 'Afiliado não encontrado' });
    }

    const landing = await prisma.landingConfig.findFirst({ where: { id: 'singleton' } });
    return res.json({
      code: account.code,
      affiliateName: account.user.name,
      checkoutUrl: AFFILIATE_PRODUCT.checkoutUrl,
      productPid: AFFILIATE_PRODUCT.productPid,
      vslEmbedHtml: landing?.affiliateVslEmbedHtml || landing?.vslEmbedHtml || null,
      creativesUrl: landing?.affiliateCreativesUrl ?? null,
    });
  } catch (error) {
    console.error('[AFF] resolve error:', error);
    return res.status(500).json({ error: 'Erro ao resolver código' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// MEMBER — all routes below need auth + active subscription
// ─────────────────────────────────────────────────────────────────────────
router.use(authMiddleware);
router.use(subscriptionMiddleware);

const PUBLIC_LINK_BASE = (process.env.FRONTEND_URL || 'https://app.czero.sbs').replace(/\/$/, '');
// The affiliate-landing public URL — kept on the marketing root, not the app
// dashboard host, so the link is short and brandable. Configurable per env.
const AFFILIATE_LINK_BASE = (process.env.AFFILIATE_LINK_BASE || 'https://czero.sbs').replace(
  /\/$/,
  '',
);

function buildAffiliateLink(code: string) {
  return `${AFFILIATE_LINK_BASE}/r/${code}`;
}

// ── GET /api/affiliate/me — account + balance ─────────────────────────────
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.affiliateAccount.findUnique({
      where: { userId: req.user!.id },
    });
    const landing = await prisma.landingConfig.findFirst({ where: { id: 'singleton' } });

    if (!account) {
      return res.json({
        enrolled: false,
        rules: AFFILIATE_RULES,
        creativesUrl: landing?.affiliateCreativesUrl ?? null,
      });
    }

    const balance = await getAffiliateBalance(account.id);
    return res.json({
      enrolled: true,
      account: {
        id: account.id,
        code: account.code,
        enabled: account.enabled,
        payoutMethod: account.payoutMethod,
        payoutTarget: account.payoutTarget,
        link: buildAffiliateLink(account.code),
        createdAt: account.createdAt,
      },
      balance,
      rules: AFFILIATE_RULES,
      creativesUrl: landing?.affiliateCreativesUrl ?? null,
    });
  } catch (error) {
    console.error('[AFF] me error:', error);
    return res.status(500).json({ error: 'Erro ao carregar conta de afiliado' });
  }
});

// ── POST /api/affiliate/enroll — generate code + create account ───────────
router.post('/enroll', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.affiliateAccount.findUnique({
      where: { userId: req.user!.id },
    });
    if (existing) {
      return res.json({
        success: true,
        account: {
          code: existing.code,
          link: buildAffiliateLink(existing.code),
        },
      });
    }
    const code = await generateUniqueAffiliateCode();
    const account = await prisma.affiliateAccount.create({
      data: { userId: req.user!.id, code },
    });
    return res.json({
      success: true,
      account: {
        code: account.code,
        link: buildAffiliateLink(account.code),
      },
    });
  } catch (error) {
    console.error('[AFF] enroll error:', error);
    return res.status(500).json({ error: 'Erro ao criar conta de afiliado' });
  }
});

// ── PATCH /api/affiliate/payout-method — set/update payout target ────────
router.patch('/payout-method', async (req: AuthRequest, res: Response) => {
  try {
    const { payoutMethod, payoutTarget } = req.body;
    if (!['mpesa', 'emola'].includes(payoutMethod)) {
      return res.status(400).json({ error: 'Método inválido' });
    }
    const cleaned = String(payoutTarget ?? '').trim();
    if (!cleaned) return res.status(400).json({ error: 'Informe o número' });

    const account = await prisma.affiliateAccount.findUnique({
      where: { userId: req.user!.id },
    });
    if (!account) return res.status(404).json({ error: 'Conta de afiliado não encontrada' });

    await prisma.affiliateAccount.update({
      where: { id: account.id },
      data: { payoutMethod, payoutTarget: cleaned },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('[AFF] payout-method error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar método de saque' });
  }
});

// ── GET /api/affiliate/referrals — paid referrals only ──────────────────
// Per the brief, affiliates only see leads that actually paid.
router.get('/referrals', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.affiliateAccount.findUnique({
      where: { userId: req.user!.id },
      include: {
        referrals: {
          where: { status: 'paid' },
          orderBy: { paidAt: 'desc' },
          take: 100,
          select: {
            id: true,
            paidAt: true,
            user: { select: { name: true } },
          },
        },
      },
    });
    if (!account) return res.json({ referrals: [] });
    return res.json({
      referrals: account.referrals.map((r) => ({
        id: r.id,
        paidAt: r.paidAt,
        leadName: r.user?.name ?? 'Lead pagante',
      })),
    });
  } catch (error) {
    console.error('[AFF] referrals error:', error);
    return res.status(500).json({ error: 'Erro ao carregar indicações' });
  }
});

// ── GET /api/affiliate/withdrawals — my withdrawal history ───────────────
router.get('/withdrawals', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.affiliateAccount.findUnique({
      where: { userId: req.user!.id },
    });
    if (!account) return res.json({ withdrawals: [] });
    const rows = await prisma.affiliateWithdrawal.findMany({
      where: { affiliateId: account.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ withdrawals: rows });
  } catch (error) {
    console.error('[AFF] withdrawals error:', error);
    return res.status(500).json({ error: 'Erro ao carregar saques' });
  }
});

// ── POST /api/affiliate/withdrawals — request a withdrawal ───────────────
router.post('/withdrawals', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.affiliateAccount.findUnique({
      where: { userId: req.user!.id },
    });
    if (!account) return res.status(404).json({ error: 'Conta de afiliado não encontrada' });

    const { amount, payoutMethod, payoutTarget, notes } = req.body;
    const finalMethod = payoutMethod ?? account.payoutMethod;
    const finalTarget = (payoutTarget ?? account.payoutTarget ?? '').toString().trim();

    if (!finalMethod) {
      return res.status(400).json({ error: 'Selecione M-Pesa ou eMola' });
    }

    const result = await requestWithdrawal({
      affiliateId: account.id,
      amountRequested: Number(amount),
      payoutMethod: finalMethod,
      payoutTarget: finalTarget,
      notes,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });

    // Persist the chosen target as the default for next time
    if (
      finalMethod !== account.payoutMethod ||
      finalTarget !== (account.payoutTarget ?? '')
    ) {
      await prisma.affiliateAccount.update({
        where: { id: account.id },
        data: { payoutMethod: finalMethod, payoutTarget: finalTarget },
      });
    }

    sendPushToSuperAdmins({
      title: '💸 Novo pedido de saque',
      body: `${req.user!.email} — ${amount} MZN (líquido: ${result.amountNet})`,
      url: '/admin/saques',
    }).catch(() => {});

    return res.json({
      success: true,
      withdrawalId: result.withdrawalId,
      amountNet: result.amountNet,
      feeAmount: result.feeAmount,
    });
  } catch (error) {
    console.error('[AFF] withdraw error:', error);
    return res.status(500).json({ error: 'Erro ao solicitar saque' });
  }
});

// ── GET /api/affiliate/withdrawals/quote?amount=N — preview fee ─────────
router.get('/withdrawals/quote', (req: AuthRequest, res: Response) => {
  const amount = parseFloat(req.query.amount as string);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valor inválido' });
  }
  return res.json(quoteWithdrawal(amount));
});

export default router;
