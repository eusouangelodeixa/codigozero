import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth.middleware';
import { partnerMiddleware } from '../middlewares/partner.middleware';
import {
  PARTNER_RULES,
  getPartnerBalance,
  quoteWithdrawal,
  requestWithdrawal,
} from '../services/partner.service';
import { sendPushToSuperAdmins } from './auth.routes';

const router = Router();
const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// All partner routes require auth + an enabled PartnerAccount. No subscription
// gate — sócios are staff, not subscribers.
router.use(authMiddleware);
router.use(partnerMiddleware);

// ── GET /api/partner/me — account + balance + rules ───────────────────────
router.get('/me', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.partnerAccount.findUnique({
      where: { id: req.partner!.id },
      include: { user: { select: { name: true, email: true } } },
    });
    if (!account) return res.status(404).json({ error: 'Conta de sócio não encontrada' });

    const balance = await getPartnerBalance(account.id);
    return res.json({
      account: {
        id: account.id,
        displayName: account.displayName || account.user.name,
        roleLabel: account.roleLabel,
        sharePct: account.sharePct,
        enabled: account.enabled,
        withdrawOnly: account.withdrawOnly,
        payoutMethod: account.payoutMethod,
        payoutTarget: account.payoutTarget,
        createdAt: account.createdAt,
      },
      balance,
      rules: PARTNER_RULES,
      withdrawOnly: account.withdrawOnly,
    });
  } catch (error) {
    console.error('[PARTNER] me error:', error);
    return res.status(500).json({ error: 'Erro ao carregar conta de sócio' });
  }
});

// ── GET /api/partner/commissions — real-time ledger ───────────────────────
// Optional ?status=pending|available|withdrawn|refunded filter.
router.get('/commissions', async (req: AuthRequest, res: Response) => {
  try {
    const status = (req.query.status as string) || undefined;
    const rows = await prisma.partnerCommission.findMany({
      where: {
        partnerId: req.partner!.id,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({
      commissions: rows.map((c) => ({
        id: c.id,
        orderId: c.orderId,
        baseAmount: c.baseAmount,
        sharePct: c.sharePct,
        amount: c.amount,
        status: c.status,
        availableAt: c.availableAt,
        createdAt: c.createdAt,
      })),
    });
  } catch (error) {
    console.error('[PARTNER] commissions error:', error);
    return res.status(500).json({ error: 'Erro ao carregar comissões' });
  }
});

// ── GET /api/partner/withdrawals — my withdrawal history ──────────────────
router.get('/withdrawals', async (req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.partnerWithdrawal.findMany({
      where: { partnerId: req.partner!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json({ withdrawals: rows });
  } catch (error) {
    console.error('[PARTNER] withdrawals error:', error);
    return res.status(500).json({ error: 'Erro ao carregar saques' });
  }
});

// ── GET /api/partner/withdrawals/quote?amount=N — preview fee ─────────────
router.get('/withdrawals/quote', (req: AuthRequest, res: Response) => {
  const amount = parseFloat(req.query.amount as string);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Valor inválido' });
  }
  return res.json(quoteWithdrawal(amount));
});

// ── POST /api/partner/withdrawals — request a withdrawal ──────────────────
router.post('/withdrawals', async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.partnerAccount.findUnique({ where: { id: req.partner!.id } });
    if (!account) return res.status(404).json({ error: 'Conta de sócio não encontrada' });

    const { amount, payoutMethod, payoutTarget, notes } = req.body;
    const finalMethod = payoutMethod ?? account.payoutMethod;
    const finalTarget = (payoutTarget ?? account.payoutTarget ?? '').toString().trim();

    if (!finalMethod) {
      return res.status(400).json({ error: 'Selecione M-Pesa ou eMola' });
    }

    const result = await requestWithdrawal({
      partnerId: account.id,
      amountRequested: Number(amount),
      payoutMethod: finalMethod,
      payoutTarget: finalTarget,
      notes,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });

    // Persist the chosen target as the default for next time.
    if (finalMethod !== account.payoutMethod || finalTarget !== (account.payoutTarget ?? '')) {
      await prisma.partnerAccount.update({
        where: { id: account.id },
        data: { payoutMethod: finalMethod, payoutTarget: finalTarget },
      });
    }

    sendPushToSuperAdmins({
      title: '💸 Saque de sócio',
      body: `${req.user!.name || req.user!.email} — ${amount} MZN (líquido: ${result.amountNet})`,
      url: '/admin/saques',
    }).catch(() => {});

    return res.json({
      success: true,
      withdrawalId: result.withdrawalId,
      amountNet: result.amountNet,
      feeAmount: result.feeAmount,
    });
  } catch (error) {
    console.error('[PARTNER] withdraw error:', error);
    return res.status(500).json({ error: 'Erro ao solicitar saque' });
  }
});

// ── PATCH /api/partner/payout-method — set/update payout target ───────────
router.patch('/payout-method', async (req: AuthRequest, res: Response) => {
  try {
    const { payoutMethod, payoutTarget } = req.body;
    if (!['mpesa', 'emola'].includes(payoutMethod)) {
      return res.status(400).json({ error: 'Método inválido' });
    }
    const cleaned = String(payoutTarget ?? '').trim();
    if (!cleaned) return res.status(400).json({ error: 'Informe o número' });

    await prisma.partnerAccount.update({
      where: { id: req.partner!.id },
      data: { payoutMethod, payoutTarget: cleaned },
    });
    return res.json({ success: true });
  } catch (error) {
    console.error('[PARTNER] payout-method error:', error);
    return res.status(500).json({ error: 'Erro ao atualizar método de saque' });
  }
});

export default router;
