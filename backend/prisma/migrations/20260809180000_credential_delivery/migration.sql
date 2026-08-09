-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "emailDailyLimit" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "emailQuotaDate" TEXT,
ADD COLUMN     "emailQuotaExhausted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailQuotaUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CredentialDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "batch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredentialDelivery_userId_key" ON "CredentialDelivery"("userId");

-- CreateIndex
CREATE INDEX "CredentialDelivery_status_dueAt_idx" ON "CredentialDelivery"("status", "dueAt");

-- AddForeignKey
ALTER TABLE "CredentialDelivery" ADD CONSTRAINT "CredentialDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

