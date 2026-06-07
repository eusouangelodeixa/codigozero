/**
 * One-off historical correction for Transaction.isRenewal.
 *
 * Context: the Lojou webhook used to set isRenewal=true whenever a User row
 * already existed for the buyer's email/phone. But we create 'lead' User rows
 * on landing capture, so first-time payers who had been captured as leads were
 * mislabelled as renovações. The webhook is now fixed for new sales; this
 * script repairs the existing rows.
 *
 * Rule (ground truth): walking approved transactions oldest→newest, the FIRST
 * paid order for a customer (matched by email OR phone) is a NEW sale; every
 * later one is a renewal.
 *
 * Usage (inside the backend container, which has @prisma/client + DATABASE_URL):
 *   node fix-historical-renewals.js            # DRY RUN (no writes)
 *   APPLY=1 node fix-historical-renewals.js    # apply the changes
 *
 * Output contains NO personal data — only order ids, gateway and flip counts.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const APPLY = process.env.APPLY === '1';

function phoneKey(p) {
  // Ignore placeholder / non-phone values; group MZ numbers by their local
  // 9 digits so "258 84..." and "84..." map together.
  if (!p || /^stripe_/i.test(p) || /^manual/i.test(p)) return '';
  const d = String(p).replace(/\D/g, '');
  if (d.length < 8) return '';
  return d.slice(-9);
}
function emailKey(e) {
  if (!e) return '';
  const v = String(e).toLowerCase().trim();
  return v.includes('@') ? v : '';
}

async function main() {
  const txs = await prisma.transaction.findMany({
    where: { status: 'approved' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, orderId: true, userEmail: true, userPhone: true, isRenewal: true, gateway: true },
  });

  const seenE = new Set();
  const seenP = new Set();
  const flips = [];
  for (const t of txs) {
    const ek = emailKey(t.userEmail);
    const pk = phoneKey(t.userPhone);
    const shouldBeRenewal = !!((ek && seenE.has(ek)) || (pk && seenP.has(pk)));
    if (shouldBeRenewal !== t.isRenewal) {
      flips.push({ id: t.id, orderId: t.orderId, gateway: t.gateway || 'lojou', from: t.isRenewal, to: shouldBeRenewal });
    }
    if (ek) seenE.add(ek);
    if (pk) seenP.add(pk);
  }

  const toRenewal = flips.filter((f) => f.to).length;
  const toNew = flips.filter((f) => !f.to).length;
  const byGateway = {};
  flips.forEach((f) => { byGateway[f.gateway] = (byGateway[f.gateway] || 0) + 1; });

  console.log(`approved_transactions=${txs.length}`);
  console.log(`flips_total=${flips.length}  ->renovacao=${toRenewal}  ->nova=${toNew}`);
  console.log(`flips_by_gateway=${JSON.stringify(byGateway)}`);
  console.log('sample (orderId | gateway | from->to) — no PII:');
  flips.slice(0, 20).forEach((f) => console.log(`  ${f.orderId} | ${f.gateway} | ${f.from}->${f.to}`));

  if (!APPLY) {
    console.log('DRY_RUN=true (nothing written). Re-run with APPLY=1 to persist.');
    return;
  }

  let n = 0;
  for (const f of flips) {
    await prisma.transaction.update({ where: { id: f.id }, data: { isRenewal: f.to } });
    n++;
  }
  console.log(`APPLIED=${n}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
