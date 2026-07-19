import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { getPartnerOpenCostShareTotal } from './cost.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://app.czero.sbs';

// ── Money / rule constants (revenue-share program) ────────────────────────
// The sócios split the NET of each main-product sale (after the Lojou fee).
// Withdrawal fee mirrors Lojou's saque fee (3% + 35 MZN). Commissions mature
// D+3 before they can be withdrawn (small hold against early refunds).
export const PARTNER_RULES = {
  withdrawalPercent: 0.03, // 3% of the requested amount...
  withdrawalFixed: 35, // ...+ 35 MZN
  minWithdrawal: 100, // minimum per withdrawal request
  availableAfterDays: 3, // pending → available window (D+3)
};

// Lojou platform fee, kept in sync with src/lib/fees.ts. Recomputed from the
// amount actually charged so coupon-discounted orders are handled naturally.
const LOJOU_PERCENT = 0.1;
const LOJOU_FIXED_PER_ITEM = 10;

const round2 = (v: number) => Math.round(v * 100) / 100;

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Base of the split ─────────────────────────────────────────────────────
/**
 * Net pool to split among partners for one order.
 *
 *   lojouFee = amount * 10% + numItems * 10
 *   base     = amount - lojouFee
 *
 * `amount` is the TOTAL actually charged (principal + every bump), so coupons
 * AND all order bumps are already reflected in the split. There is no
 * coproducer split on the main product.
 *
 * `numItems` is the number of charged items (principal + each bump) — it only
 * affects the fixed 10 MZN/item slice of the Lojou fee. When omitted, falls
 * back to the legacy 1-or-2 derived from `isCloseFriends`.
 */
export function computePartnerBase(opts: {
  amount: number;
  numItems?: number;
  isCloseFriends?: boolean;
}): number {
  const amount = Math.max(0, opts.amount || 0);
  if (amount <= 0) return 0;
  const numItems = Math.max(1, opts.numItems ?? (opts.isCloseFriends ? 2 : 1));
  const lojouFee = amount * LOJOU_PERCENT + numItems * LOJOU_FIXED_PER_ITEM;
  return round2(Math.max(0, amount - lojouFee));
}

export function quoteWithdrawal(amountRequested: number) {
  const fee = amountRequested * PARTNER_RULES.withdrawalPercent + PARTNER_RULES.withdrawalFixed;
  const net = Math.max(0, amountRequested - fee);
  return {
    amountRequested: round2(amountRequested),
    feeAmount: round2(fee),
    amountNet: round2(net),
  };
}

// ── Commission credit (called from the Lojou webhook) ─────────────────────
/**
 * Credit every enabled partner for a confirmed main-product sale.
 *
 * Caller is responsible for the eligibility gate (skip when the order was
 * attributed to an affiliate or external coproducer, or came via Stripe, or
 * is a webhook re-delivery). Idempotent at the DB level via the unique
 * (partnerId, orderId) constraint — a re-run skips already-credited pairs.
 *
 * Each partner's amount = base * sharePct/100 (rounded to 2dp). When shares
 * sum to 100 the per-partner amounts add up to the base within sub-cent
 * drift; when they sum to <100 the remainder simply stays with the company.
 */
export async function creditPartnersForOrder(opts: {
  orderId: string;
  amount: number;
  numItems?: number;
  isCloseFriends?: boolean;
}): Promise<{ credited: number; base: number }> {
  const base = computePartnerBase({
    amount: opts.amount,
    numItems: opts.numItems,
    isCloseFriends: opts.isCloseFriends,
  });
  if (base <= 0) return { credited: 0, base: 0 };

  const partners = await prisma.partnerAccount.findMany({ where: { enabled: true } });
  if (partners.length === 0) return { credited: 0, base };

  const availableAt = new Date(Date.now() + PARTNER_RULES.availableAfterDays * DAY_MS);
  let credited = 0;

  for (const p of partners) {
    const amount = round2((base * p.sharePct) / 100);
    if (amount <= 0) continue;
    try {
      await prisma.partnerCommission.create({
        data: {
          partnerId: p.id,
          orderId: opts.orderId,
          baseAmount: base,
          sharePct: p.sharePct,
          amount,
          availableAt,
          status: 'pending',
        },
      });
      credited++;
    } catch (e: any) {
      // P2002 = unique violation → already credited for this (partner, order).
      if (e?.code !== 'P2002') throw e;
    }
  }

  return { credited, base };
}

/** When a sale is refunded, reverse partner commissions still in the pool. */
export async function reversePartnersForOrder(orderId: string): Promise<number> {
  const updated = await prisma.partnerCommission.updateMany({
    where: { orderId, status: { in: ['pending', 'available'] } },
    data: { status: 'refunded' },
  });
  return updated.count;
}

// ── Pending → Available transition (called by cron) ───────────────────────
export async function transitionDuePartnerPending(): Promise<number> {
  const result = await prisma.partnerCommission.updateMany({
    where: { status: 'pending', availableAt: { lte: new Date() } },
    data: { status: 'available' },
  });
  return result.count;
}

// ── Balance & stats ───────────────────────────────────────────────────────
export async function getPartnerBalance(partnerId: string) {
  const [pendingAgg, availableAgg, withdrawnAgg] = await Promise.all([
    prisma.partnerCommission.aggregate({
      where: { partnerId, status: 'pending' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.partnerCommission.aggregate({
      where: { partnerId, status: 'available' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.partnerCommission.aggregate({
      where: { partnerId, status: 'withdrawn' },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const grossAvailable = round2(availableAgg._sum.amount ?? 0);
  const pending = round2(pendingAgg._sum.amount ?? 0);
  const withdrawn = round2(withdrawnAgg._sum.amount ?? 0);

  // Open shared-cost debits reduce what the partner can actually withdraw.
  const costShare = await getPartnerOpenCostShareTotal(partnerId);
  const available = round2(Math.max(0, grossAvailable - costShare));

  return {
    available,            // net withdrawable (after open cost shares)
    grossAvailable,       // commissions available before cost deductions
    costShare,            // open shared-cost debits
    pending,
    withdrawn,
    salesCount: availableAgg._count + pendingAgg._count + withdrawnAgg._count,
    lifetimeEarnings: round2(grossAvailable + pending + withdrawn),
  };
}

// ── Withdrawal flow ───────────────────────────────────────────────────────
/**
 * Request a withdrawal: consumes commissions from the 'available' pool, marks
 * them 'withdrawn', and creates the PartnerWithdrawal row in 'pending' state
 * for an admin to process.
 */
export async function requestWithdrawal(opts: {
  partnerId: string;
  amountRequested: number;
  payoutMethod: string;
  payoutTarget: string;
  notes?: string;
}): Promise<
  | { ok: true; withdrawalId: string; amountNet: number; feeAmount: number }
  | { ok: false; error: string }
> {
  const amount = Number(opts.amountRequested);
  if (!Number.isFinite(amount) || amount < PARTNER_RULES.minWithdrawal) {
    return { ok: false, error: `Saque mínimo: ${PARTNER_RULES.minWithdrawal} MZN` };
  }
  if (!['mpesa', 'emola'].includes(opts.payoutMethod)) {
    return { ok: false, error: 'Método de saque inválido' };
  }
  if (!opts.payoutTarget?.trim()) {
    return { ok: false, error: 'Informe o número para recebimento' };
  }

  return prisma.$transaction(async (tx) => {
    const available = await tx.partnerCommission.findMany({
      where: { partnerId: opts.partnerId, status: 'available' },
      orderBy: { availableAt: 'asc' },
    });
    const grossBalance = available.reduce((s, c) => s + c.amount, 0);

    // Open shared-cost debits are paid from the pool too: net withdrawable =
    // gross commissions − what the partner owes toward shared costs.
    const openShares = await tx.partnerCostShare.findMany({
      where: { partnerId: opts.partnerId, status: 'open' },
    });
    const owed = openShares.reduce((s, cs) => s + cs.amount, 0);
    const net = grossBalance - owed;
    if (net < amount) {
      return { ok: false as const, error: `Saldo insuficiente (disponível após custos: ${round2(Math.max(0, net))} MZN)` };
    }

    // Remove (amount + owed) of commissions from the pool: `amount` is paid out
    // and `owed` is absorbed to settle the shared-cost debits. Consume greedily;
    // the last row may overshoot (kept whole — splitting complicates refunds).
    const target = amount + owed;
    const consumedIds: string[] = [];
    let consumed = 0;
    for (const c of available) {
      if (consumed >= target) break;
      consumedIds.push(c.id);
      consumed += c.amount;
    }

    const q = quoteWithdrawal(amount);
    const withdrawal = await tx.partnerWithdrawal.create({
      data: {
        partnerId: opts.partnerId,
        amountRequested: q.amountRequested,
        feeAmount: q.feeAmount,
        amountNet: q.amountNet,
        payoutMethod: opts.payoutMethod,
        payoutTarget: opts.payoutTarget.trim(),
        notes: opts.notes?.slice(0, 500) ?? null,
        status: 'pending',
      },
    });

    const consumeResult = await tx.partnerCommission.updateMany({
      where: { id: { in: consumedIds }, status: 'available' },
      data: { status: 'withdrawn', withdrawalId: withdrawal.id },
    });
    // Consumo condicional: se outra requisição concorrente já consumiu alguma
    // dessas comissões, o count diverge — abortamos (rollback) para não lastrear
    // dois saques no mesmo pool de comissões (pagamento em dobro).
    if (consumeResult.count !== consumedIds.length) {
      throw new Error('WITHDRAWAL_CONFLICT');
    }

    // Settle the partner's open cost debits — they were just covered by the
    // consumed commissions, so they stop reducing future balances.
    if (openShares.length > 0) {
      const settleResult = await tx.partnerCostShare.updateMany({
        where: { id: { in: openShares.map((s) => s.id) }, status: 'open' },
        data: { status: 'settled', settledAt: new Date(), withdrawalId: withdrawal.id },
      });
      if (settleResult.count !== openShares.length) {
        throw new Error('WITHDRAWAL_CONFLICT');
      }
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
  return prisma.partnerWithdrawal.update({
    where: { id },
    data: { status: 'paid', processedAt: new Date(), processedBy, notes: notes ?? undefined },
  });
}

/**
 * Auto-offboard a withdraw-only sócio once they've fully cashed out. Called
 * right after a withdrawal is marked paid. Anonymizes + deactivates ONLY when:
 *   • the partner is in withdrawOnly mode (an offboarded sócio), AND
 *   • nothing is left to pay (available + pending ≈ 0), AND
 *   • there are no other pending payouts queued.
 * The financial records (PartnerCommission / PartnerWithdrawal, incl. the
 * payoutTarget) are PRESERVED for accounting — only the User's login identity
 * (name/email/phone/avatar) is scrubbed and isActive flipped off.
 *
 * Reversible: reactivate isActive to re-enable; the original name/email/phone
 * are logged once here at scrub time. Fully non-blocking — any error is
 * swallowed so it can never break the payout approval.
 */
export async function autoOffboardIfFullyPaid(
  partnerId: string,
): Promise<{ anonymized: boolean; reason?: string }> {
  try {
    const account = await prisma.partnerAccount.findUnique({
      where: { id: partnerId },
      include: { user: { select: { id: true, name: true, email: true, phone: true, isActive: true } } },
    });
    if (!account || !account.withdrawOnly) return { anonymized: false, reason: 'not-withdraw-only' };
    if (!account.user || !account.user.isActive) return { anonymized: false, reason: 'already-inactive' };

    const bal = await getPartnerBalance(partnerId);
    if (bal.available > 0.01 || bal.pending > 0.01) return { anonymized: false, reason: 'balance-remaining' };

    const otherPending = await prisma.partnerWithdrawal.count({ where: { partnerId, status: 'pending' } });
    if (otherPending > 0) return { anonymized: false, reason: 'pending-withdrawals' };

    const u = account.user;
    // Audit trail: log the originals once before scrubbing (recovery path).
    console.warn(
      `[OFFBOARD] Anonimizando sócio cashed-out partnerId=${partnerId} userId=${u.id} | original name="${u.name}" email="${u.email}" phone="${u.phone}"`,
    );

    await prisma.$transaction([
      prisma.user.update({
        where: { id: u.id },
        data: {
          isActive: false,
          name: 'Sócio removido',
          email: `removed-${u.id}@czero.invalid`,
          phone: `removed-${u.id}`,
          avatarUrl: null,
        },
      }),
      prisma.affiliateAccount.updateMany({ where: { userId: u.id }, data: { enabled: false } }),
    ]);

    console.warn(`[OFFBOARD] ✅ Sócio anonimizado e desativado userId=${u.id}`);
    return { anonymized: true };
  } catch (e: any) {
    console.error('[OFFBOARD] auto-offboard error (non-blocking):', e?.message || e);
    return { anonymized: false, reason: 'error' };
  }
}

/** Admin rejects a withdrawal — releases the consumed commissions back. */
export async function rejectWithdrawal(id: string, processedBy: string, notes?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.partnerCommission.updateMany({
      where: { withdrawalId: id, status: 'withdrawn' },
      data: { status: 'available', withdrawalId: null },
    });
    return tx.partnerWithdrawal.update({
      where: { id },
      data: { status: 'rejected', processedAt: new Date(), processedBy, notes: notes ?? undefined },
    });
  });
}

/** Sum of enabled partners' shares — used by the admin UI to flag ≠ 100. */
export async function getActivePartnerShareTotal(): Promise<number> {
  const agg = await prisma.partnerAccount.aggregate({
    where: { enabled: true },
    _sum: { sharePct: true },
  });
  return round2(agg._sum.sharePct ?? 0);
}

// ── Welcome message (credentials via WhatsApp) ────────────────────────────
/**
 * Send a partner their login credentials via WhatsApp (Komunika). Mirrors the
 * coproducer welcome flow: generate a fresh random password, persist its hash,
 * and message the user. Returns delivery status so the admin endpoint can
 * surface success/failure (and the raw password is logged for manual recovery
 * when WhatsApp is down).
 */
export async function sendPartnerWelcome(opts: { partnerAccountId: string }): Promise<{
  delivered: boolean;
  status: number | string;
  passwordSent: boolean;
}> {
  const account = await prisma.partnerAccount.findUnique({
    where: { id: opts.partnerAccountId },
    include: { user: true },
  });
  if (!account) return { delivered: false, status: 'no_account', passwordSent: false };

  const rawPassword = crypto.randomInt(10000000, 99999999).toString();
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  await prisma.user.update({
    where: { id: account.userId },
    data: { passwordHash },
  });
  console.log(`[PARTNER] 🔑 Credenciais — Email: ${account.user.email} | Senha: ${rawPassword}`);

  const displayName = account.displayName || account.user.name;
  const loginUrl = `${FRONTEND_URL}/login`;
  const message = [
    `🤝 *Bem-vindo à sociedade do Código Zero, ${displayName}!*`,
    ``,
    `Sua conta de sócio está ativa (participação: ${account.sharePct}%).`,
    ``,
    `📧 *Email:* ${account.user.email}`,
    `🔑 *Senha:* ${rawPassword}`,
    ``,
    `🔗 *Painel:* ${loginUrl}`,
    ``,
    `Em "Sócios" você acompanha sua parte das vendas em tempo real e solicita saques.`,
    ``,
    `Guarde estas credenciais em local seguro.`,
  ].join('\n');

  const sysConfig = await prisma.systemConfig.findFirst({ where: { id: 'singleton' } });
  const komunikaKey = sysConfig?.komunikaAdminApiKey || process.env.KOMUNIKA_ADMIN_API_KEY;
  const komunikaUrl = process.env.KOMUNIKA_API_URL || 'https://api.komunika.site';
  const instanceId = sysConfig?.komunikaInstanceId;

  if (!komunikaKey || !instanceId) {
    return { delivered: false, status: 'komunika_not_configured', passwordSent: false };
  }

  let cleanPhone = account.user.phone.replace(/\D/g, '');
  if (cleanPhone.length === 9 && cleanPhone.startsWith('8')) {
    cleanPhone = `258${cleanPhone}`;
  }

  let delivered = false;
  let lastStatus: number | string = 'no-attempt';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${komunikaUrl}/api/v1/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': komunikaKey },
        body: JSON.stringify({ instanceId, to: cleanPhone, type: 'text', content: message }),
      });
      lastStatus = res.status;
      if (res.ok) {
        delivered = true;
        break;
      }
    } catch (e: any) {
      lastStatus = `throw:${e?.message || 'unknown'}`;
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }

  return { delivered, status: lastStatus, passwordSent: delivered };
}
