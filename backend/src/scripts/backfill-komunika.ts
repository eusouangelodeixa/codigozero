/**
 * One-off backfill: provision a Komunika tenant for every CURRENT paying member.
 *
 * Provisioning normally fires on order.approved / Stripe checkout, so members
 * who paid BEFORE the Komunika module shipped have komunikaCompanyId = null and
 * no tenant. This walks active/grace_period members that aren't provisioned yet
 * and calls provisionKomunika (idempotent + guarded) for each, sequentially, to
 * avoid hammering api.komunika.site.
 *
 * Run inside the backend container (has the KOMUNIKA secrets + DB):
 *   docker exec czero_backend_prod node dist/scripts/backfill-komunika.js
 *
 * Safe to re-run: already-provisioned users are skipped by the guard.
 */
import { PrismaClient } from '@prisma/client';
import { provisionKomunika } from '../services/komunika.service';

const prisma = (((globalThis as any).__czPrisma ??= new PrismaClient()) as PrismaClient);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const targets = await prisma.user.findMany({
    where: {
      subscriptionStatus: { in: ['active', 'grace_period'] },
      komunikaCompanyId: null,
    },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[BACKFILL] ${targets.length} paying member(s) to provision.`);
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const u = targets[i];
    try {
      await provisionKomunika(u.id);
      ok++;
      console.log(`[BACKFILL] (${i + 1}/${targets.length}) ✅ ${u.id}`);
    } catch (e: any) {
      failed++;
      console.error(`[BACKFILL] (${i + 1}/${targets.length}) ❌ ${u.id}: ${e?.message || e}`);
    }
    // Gentle pacing between calls.
    await sleep(200);
  }

  console.log(`[BACKFILL] Done. provisioned=${ok} failed=${failed} total=${targets.length}`);
}

main()
  .catch((e) => {
    console.error('[BACKFILL] Fatal:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode || 0);
  });
