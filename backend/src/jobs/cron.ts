import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Start all CRON jobs for the Código Zero platform.
 */
export function startCronJobs() {
  // ── Daily Subscription Check (00:00 every day) ──
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] 🔄 Running daily subscription check...');

    try {
      const now = new Date();

      // Find users with expired subscriptions that are still active
      const expiredActive = await prisma.user.findMany({
        where: {
          subscriptionStatus: 'active',
          subscriptionEnd: { lt: now },
        },
      });

      for (const user of expiredActive) {
        const expiryDate = user.subscriptionEnd!;
        const hoursSinceExpiry = (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60);

        if (hoursSinceExpiry <= 72) {
          // Grace period (0-72h after expiry)
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: 'grace_period' },
          });
          console.log(`[CRON] ⚠️ User ${user.email} moved to grace_period`);
        } else {
          // Overdue (>72h after expiry)
          await prisma.user.update({
            where: { id: user.id },
            data: { subscriptionStatus: 'overdue', isActive: false },
          });
          console.log(`[CRON] 🔒 User ${user.email} blocked (overdue)`);
        }
      }

      // Check grace_period users that exceeded 72h
      const graceExpired = await prisma.user.findMany({
        where: {
          subscriptionStatus: 'grace_period',
          subscriptionEnd: {
            lt: new Date(now.getTime() - 72 * 60 * 60 * 1000),
          },
        },
      });

      for (const user of graceExpired) {
        await prisma.user.update({
          where: { id: user.id },
          data: { subscriptionStatus: 'overdue', isActive: false },
        });
        console.log(`[CRON] 🔒 User ${user.email} grace period expired → overdue`);
      }

      // Reset daily search counters
      await prisma.user.updateMany({
        where: { dailySearchCount: { gt: 0 } },
        data: { dailySearchCount: 0 },
      });

      console.log(`[CRON] ✅ Subscription check complete. Processed ${expiredActive.length + graceExpired.length} users.`);

    } catch (error) {
      console.error('[CRON] ❌ Subscription check failed:', error);
    }
  });

  console.log('[CRON] ⏰ Daily subscription check scheduled (00:00)');
}
