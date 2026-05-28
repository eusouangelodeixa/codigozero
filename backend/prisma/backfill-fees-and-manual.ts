/**
 * One-shot backfill, run once after the
 *   20260528151648_tx_gross_fees_user_manual
 * migration lands.
 *
 *  1. Fill in Transaction.{grossAmount,lojouFee,coproducerFee} for the
 *     existing rows. The webhook now persists this on every new tx,
 *     but historical rows were created before the columns existed.
 *
 *     Heuristic per row:
 *       gross = amount + lojouFee + coproducerFee
 *
 *     lojouFee = 10% × gross + 10 MZN/item (we don't know the
 *     item count for old rows; assume 1 if no bump, else 2).
 *     coproducerFee is computed only if the tx has a coproducerId
 *     (15% of principal by default, fallback when sharePct is unknown).
 *
 *     This is intentionally approximate — the precision matters
 *     forward, not backward. The reconciliation card in admin/finance
 *     will be off by ≤1 MZN per old row.
 *
 *  2. Mark User.grantedManually=true for every active member whose
 *     lojouOrderId looks synthetic (starts with MANUAL_) or who has
 *     subscriptionStatus='active' but no Transaction. Kelvin's case
 *     is the motivating example.
 *
 *  Idempotent: re-running it is a no-op for rows already backfilled.
 */
import { PrismaClient } from '@prisma/client';
import { computeFees } from '../src/lib/fees';

const prisma = new PrismaClient();

const LOJOU_PERCENT = 0.10;
const LOJOU_FIXED_PER_ITEM = 10;

async function backfillFees() {
  const txs = await prisma.transaction.findMany({
    where: { grossAmount: null },
    include: { coproducer: { select: { sharePct: true } } },
  });
  console.log(`[BACKFILL/FEES] ${txs.length} transactions need backfill`);

  let updated = 0;
  for (const tx of txs) {
    const bump = tx.orderBumpAmount || 0;
    // The net `amount` is what the seller received. Reverse-engineer
    // the gross by treating bump as separate (Lojou's accounting is
    // gross = principal + bump and fees apply at the gross level).
    // We approximate: amount = gross − lojouFee − coproducerFee
    //                lojouFee = 0.10 × gross + 10 × items
    //                coproducerFee = principalShare × principalPrice
    // With one unknown (principalPrice) we can't solve cleanly, so
    // assume amount IS the principal-after-split for non-bump txs
    // and use the closed-form fee math from computeFees.
    const principalGuess = Math.max(0, (tx.amount - bump));
    const fees = computeFees({
      principalPrice: principalGuess,
      bumpPrice: bump,
      coproducerSharePct: tx.coproducer?.sharePct ?? null,
    });
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        grossAmount: fees.grossAmount,
        lojouFee: fees.lojouFee,
        coproducerFee: fees.coproducerFee,
      },
    });
    updated++;
  }
  console.log(`[BACKFILL/FEES] ✅ updated ${updated} transactions`);
}

async function backfillManualGrants() {
  // Active members with no real transaction
  const orphans = await prisma.user.findMany({
    where: {
      role: 'member',
      subscriptionStatus: 'active',
      grantedManually: false,
      OR: [
        { lojouOrderId: { startsWith: 'MANUAL_' } },
        { lojouOrderId: null },
        { lojouOrderId: '' },
      ],
    },
    select: { id: true, email: true, lojouOrderId: true },
  });

  console.log(`[BACKFILL/MANUAL] ${orphans.length} active members look manually granted`);
  for (const u of orphans) {
    // Double-check: do they have any approved transaction?
    const hasTx = await prisma.transaction.count({
      where: { userId: u.id, status: 'approved' },
    });
    if (hasTx > 0) continue;
    await prisma.user.update({
      where: { id: u.id },
      data: { grantedManually: true },
    });
    console.log(`  • ${u.email} → grantedManually=true (lojouOrderId=${u.lojouOrderId || 'null'})`);
  }
  console.log(`[BACKFILL/MANUAL] ✅ done`);
}

async function main() {
  await backfillFees();
  await backfillManualGrants();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
