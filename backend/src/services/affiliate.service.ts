import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

// ── Money / rule constants (per the affiliate program brief) ──────────────
// salePrice is the gross sale value used by quoteCommission() when no
// explicit amount is passed. It mirrors the Lojou plan price for the
// affiliate-dedicated product (nrUnJ / O Codigo Zero / zEJP6), currently
// aligned with the main plan at 497 MZN.
export const AFFILIATE_RULES = {
  salePrice: 497,
  commissionRate: 0.60,          // affiliate gets 60% of the sale (gross)
  platformPercent: 0.10,          // platform fee = 10% of sale amount...
  platformFixed: 10,              // ...+ 10 MZN, deducted from gross commission
  withdrawalPercent: 0.03,        // withdrawal fee = 3% of requested...
  withdrawalFixed: 45,            // ...+ 45 MZN
  minWithdrawal: 1000,
  availableAfterDays: 7,          // commissions become withdrawable D+7
};

// ── Lojou product config — affiliate sales come in on a DIFFERENT product ──
// than the main landing. Must match the brief and the Lojou setup.
export const AFFILIATE_PRODUCT = {
  productId: process.env.LOJOU_AFFILIATE_PRODUCT_ID || '3919',
  productPid: process.env.LOJOU_AFFILIATE_PRODUCT_PID || 'zEJP6',
  checkoutUrl:
    process.env.LOJOU_AFFILIATE_CHECKOUT_URL || 'https://pay.lojou.app/p/zEJP6',
};

// ── Code generation ───────────────────────────────────────────────────────
// 7–9 alphanumeric chars. We exclude ambiguous glyphs (0/O, 1/I/l).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz';

function randomCode(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

/** Generate a unique code, retrying on collision. */
export async function generateUniqueAffiliateCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const len = 7 + Math.floor(Math.random() * 3); // 7–9
    const code = randomCode(len);
    const exists = await prisma.affiliateAccount.findUnique({ where: { code } });
    if (!exists) return code;
  }
  // Last resort — longer code
  return randomCode(9) + randomCode(2);
}

// ── Commission math ───────────────────────────────────────────────────────
export function quoteCommission(saleAmount: number = AFFILIATE_RULES.salePrice) {
  const gross = saleAmount * AFFILIATE_RULES.commissionRate;
  const fee = saleAmount * AFFILIATE_RULES.platformPercent + AFFILIATE_RULES.platformFixed;
  const net = Math.max(0, gross - fee);
  return {
    saleAmount,
    grossAmount: round2(gross),
    feeAmount: round2(fee),
    netAmount: round2(net),
  };
}

export function quoteWithdrawal(amountRequested: number) {
  const fee = amountRequested * AFFILIATE_RULES.withdrawalPercent + AFFILIATE_RULES.withdrawalFixed;
  const net = Math.max(0, amountRequested - fee);
  return { amountRequested: round2(amountRequested), feeAmount: round2(fee), amountNet: round2(net) };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

// ── Balance & stats ───────────────────────────────────────────────────────
export async function getAffiliateBalance(affiliateId: string) {
  const [pendingAgg, availableAgg, withdrawnAgg, paidLeadCount] = await Promise.all([
    prisma.affiliateCommission.aggregate({
      where: { affiliateId, status: 'pending' },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.affiliateCommission.aggregate({
      where: { affiliateId, status: 'available' },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.affiliateCommission.aggregate({
      where: { affiliateId, status: 'withdrawn' },
      _sum: { netAmount: true },
      _count: true,
    }),
    prisma.affiliateReferral.count({
      where: { affiliateId, status: 'paid' },
    }),
  ]);

  return {
    available: round2(availableAgg._sum.netAmount ?? 0),
    pending: round2(pendingAgg._sum.netAmount ?? 0),
    withdrawn: round2(withdrawnAgg._sum.netAmount ?? 0),
    paidLeadCount,
    paidLeadEarnings: round2(
      (availableAgg._sum.netAmount ?? 0) +
        (pendingAgg._sum.netAmount ?? 0) +
        (withdrawnAgg._sum.netAmount ?? 0),
    ),
  };
}

// ── Pending → Available transition (called by cron) ───────────────────────
export async function transitionDuePending(): Promise<number> {
  const result = await prisma.affiliateCommission.updateMany({
    where: { status: 'pending', availableAt: { lte: new Date() } },
    data: { status: 'available' },
  });
  return result.count;
}

// ── Commission credit (called from webhook) ───────────────────────────────
/**
 * Credit an affiliate for a confirmed sale, unless the sale was recovered via
 * remarketing (per program rules, recovered sales belong to the system).
 *
 * Returns the created commission row, or null if no credit was issued and the
 * reason in `skipped`.
 */
export async function creditCommissionForOrder(opts: {
  userId: string;
  affiliateCode: string | null | undefined;
  remarketingStage: string | null | undefined;
  saleAmount: number;
  lojouOrderId: string;
}): Promise<
  | { credited: true; commissionId: string; affiliateId: string }
  | { credited: false; skipped: string }
> {
  const code = opts.affiliateCode?.trim();
  if (!code) return { credited: false, skipped: 'no_affiliate_code' };

  const stage = (opts.remarketingStage ?? 'none').toLowerCase();
  if (stage === 'checkout_failed_sent') {
    // Match the lingering referral as "lost_to_remarketing" so the affiliate
    // panel doesn't keep showing this lead as pending forever.
    await prisma.affiliateReferral.updateMany({
      where: { email: { not: null }, status: 'pending', userId: opts.userId },
      data: { status: 'lost_to_remarketing' },
    });
    return { credited: false, skipped: 'recovered_via_remarketing' };
  }

  const affiliate = await prisma.affiliateAccount.findUnique({ where: { code } });
  if (!affiliate || !affiliate.enabled) {
    return { credited: false, skipped: 'affiliate_not_found_or_disabled' };
  }

  // Deduplicate by Lojou order
  const existing = await prisma.affiliateCommission.findFirst({
    where: { lojouOrderId: opts.lojouOrderId, affiliateId: affiliate.id },
  });
  if (existing) {
    return { credited: false, skipped: 'already_credited' };
  }

  const q = quoteCommission(opts.saleAmount);
  const availableAt = new Date(Date.now() + AFFILIATE_RULES.availableAfterDays * 24 * 60 * 60 * 1000);

  // Try to attach to an existing pending referral row
  const referral = await prisma.affiliateReferral.findFirst({
    where: { affiliateId: affiliate.id, userId: opts.userId },
    orderBy: { createdAt: 'desc' },
  });

  if (referral) {
    await prisma.affiliateReferral.update({
      where: { id: referral.id },
      data: { status: 'paid', paidAt: new Date() },
    });
  }

  const commission = await prisma.affiliateCommission.create({
    data: {
      affiliateId: affiliate.id,
      referralId: referral?.id ?? null,
      lojouOrderId: opts.lojouOrderId,
      saleAmount: q.saleAmount,
      grossAmount: q.grossAmount,
      feeAmount: q.feeAmount,
      netAmount: q.netAmount,
      availableAt,
      status: 'pending',
    },
  });

  return { credited: true, commissionId: commission.id, affiliateId: affiliate.id };
}

/** When a sale is refunded, mark its commission row as refunded. */
export async function refundCommissionForOrder(lojouOrderId: string): Promise<number> {
  const updated = await prisma.affiliateCommission.updateMany({
    where: { lojouOrderId, status: { in: ['pending', 'available'] } },
    data: { status: 'refunded' },
  });
  return updated.count;
}

// ── Withdrawal flow ───────────────────────────────────────────────────────
/**
 * Request a withdrawal: consumes commissions from the 'available' pool, marks
 * them 'withdrawn', and creates the AffiliateWithdrawal row in 'pending' state
 * for the admin to process.
 */
export async function requestWithdrawal(opts: {
  affiliateId: string;
  amountRequested: number;
  payoutMethod: string;
  payoutTarget: string;
  notes?: string;
}): Promise<
  | { ok: true; withdrawalId: string; amountNet: number; feeAmount: number }
  | { ok: false; error: string }
> {
  const amount = Number(opts.amountRequested);
  if (!Number.isFinite(amount) || amount < AFFILIATE_RULES.minWithdrawal) {
    return { ok: false, error: `Saque mínimo: ${AFFILIATE_RULES.minWithdrawal} MZN` };
  }
  if (!['mpesa', 'emola'].includes(opts.payoutMethod)) {
    return { ok: false, error: 'Método de saque inválido' };
  }
  if (!opts.payoutTarget?.trim()) {
    return { ok: false, error: 'Informe o número para recebimento' };
  }

  // Validate balance + consume commissions atomically.
  return prisma.$transaction(async (tx) => {
    const available = await tx.affiliateCommission.findMany({
      where: { affiliateId: opts.affiliateId, status: 'available' },
      orderBy: { availableAt: 'asc' },
    });
    const balance = available.reduce((s, c) => s + c.netAmount, 0);
    if (balance < amount) {
      return { ok: false as const, error: `Saldo insuficiente (disponível: ${round2(balance)} MZN)` };
    }

    // Consume commissions greedily until we hit the requested amount.
    const consumedIds: string[] = [];
    let consumed = 0;
    for (const c of available) {
      if (consumed >= amount) break;
      consumedIds.push(c.id);
      consumed += c.netAmount;
    }
    // If the last commission overshoots, we still consume the whole row — the
    // remainder stays as the affiliate's surplus next cycle.
    // (Splitting a single commission row would complicate refund handling.)

    const q = quoteWithdrawal(amount);
    const withdrawal = await tx.affiliateWithdrawal.create({
      data: {
        affiliateId: opts.affiliateId,
        amountRequested: q.amountRequested,
        feeAmount: q.feeAmount,
        amountNet: q.amountNet,
        payoutMethod: opts.payoutMethod,
        payoutTarget: opts.payoutTarget.trim(),
        notes: opts.notes?.slice(0, 500) ?? null,
        status: 'pending',
      },
    });

    const consumeResult = await tx.affiliateCommission.updateMany({
      where: { id: { in: consumedIds }, status: 'available' },
      data: { status: 'withdrawn', withdrawalId: withdrawal.id },
    });
    // Consumo condicional: se uma requisição concorrente já consumiu alguma
    // dessas comissões, o count diverge — abortamos (rollback) para não lastrear
    // dois saques pendentes no mesmo pool de comissões (pagamento em dobro).
    if (consumeResult.count !== consumedIds.length) {
      throw new Error('WITHDRAWAL_CONFLICT');
    }

    return {
      ok: true as const,
      withdrawalId: withdrawal.id,
      amountNet: q.amountNet,
      feeAmount: q.feeAmount,
    };
  }).catch((e: any) => {
    if (e?.message === 'WITHDRAWAL_CONFLICT') {
      return { ok: false as const, error: 'Saldo alterado durante o processamento. Tente novamente.' };
    }
    throw e;
  });
}

/** Admin approves a withdrawal — marks paid + records who/when. */
export async function markWithdrawalPaid(id: string, processedBy: string, notes?: string) {
  return prisma.affiliateWithdrawal.update({
    where: { id },
    data: { status: 'paid', processedAt: new Date(), processedBy, notes: notes ?? undefined },
  });
}

/** Admin rejects a withdrawal — releases the consumed commissions back. */
export async function rejectWithdrawal(id: string, processedBy: string, notes?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.affiliateCommission.updateMany({
      where: { withdrawalId: id, status: 'withdrawn' },
      data: { status: 'available', withdrawalId: null },
    });
    return tx.affiliateWithdrawal.update({
      where: { id },
      data: { status: 'rejected', processedAt: new Date(), processedBy, notes: notes ?? undefined },
    });
  });
}
