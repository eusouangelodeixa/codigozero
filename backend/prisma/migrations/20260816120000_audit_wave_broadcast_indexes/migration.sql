-- AlterTable
ALTER TABLE "ScheduledDispatch" ADD COLUMN IF NOT EXISTS "lastContactIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminBroadcast" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "message" TEXT NOT NULL,
    "instanceId" TEXT,
    "delayMin" INTEGER NOT NULL DEFAULT 5,
    "delayMax" INTEGER NOT NULL DEFAULT 15,
    "sendPush" BOOLEAN NOT NULL DEFAULT false,
    "generateCoupons" BOOLEAN NOT NULL DEFAULT false,
    "couponDiscount" INTEGER,
    "couponMaxUses" INTEGER,
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "coupons" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AdminBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminBroadcastRecipient" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBroadcastRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminBroadcast_status_idx" ON "AdminBroadcast"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminBroadcastRecipient_jobId_status_idx" ON "AdminBroadcastRecipient"("jobId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_subscriptionStatus_subscriptionEnd_idx" ON "User"("subscriptionStatus", "subscriptionEnd");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_subscriptionEnd_idx" ON "User"("subscriptionEnd");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_newsletterWelcomeSentAt_newsletterWelcomeDueAt_idx" ON "User"("newsletterWelcomeSentAt", "newsletterWelcomeDueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_saveContactSentAt_saveContactDueAt_idx" ON "User"("saveContactSentAt", "saveContactDueAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_referredByCoproducer_idx" ON "User"("referredByCoproducer");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CredentialDelivery_channel_sentAt_idx" ON "CredentialDelivery"("channel", "sentAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_status_createdAt_idx" ON "Transaction"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_userPhone_idx" ON "Transaction"("userPhone");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ScrapedLead_jobId_createdAt_idx" ON "ScrapedLead"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_channel_readAt_idx" ON "ChatMessage"("channel", "readAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FeedbackSurvey_suggestionStatus_suggestionWindowEndsAt_idx" ON "FeedbackSurvey"("suggestionStatus", "suggestionWindowEndsAt");

-- AddForeignKey
ALTER TABLE "AdminBroadcastRecipient" ADD CONSTRAINT "AdminBroadcastRecipient_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AdminBroadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

