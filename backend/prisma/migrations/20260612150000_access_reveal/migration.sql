-- Access-recovery fallback (/resgate): one-time on-screen reveal of access data.
ALTER TABLE "User" ADD COLUMN "accessRevealedAt" TIMESTAMP(3);
