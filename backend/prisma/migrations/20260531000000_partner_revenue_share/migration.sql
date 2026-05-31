-- CreateTable: PartnerAccount
CREATE TABLE "PartnerAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "roleLabel" TEXT,
    "sharePct" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "payoutMethod" TEXT,
    "payoutTarget" TEXT,
    "notifySale" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartnerAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerAccount_userId_key" ON "PartnerAccount"("userId");
CREATE INDEX "PartnerAccount_enabled_idx" ON "PartnerAccount"("enabled");
ALTER TABLE "PartnerAccount" ADD CONSTRAINT "PartnerAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: PartnerCommission
CREATE TABLE "PartnerCommission" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "sharePct" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "withdrawalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PartnerCommission_partnerId_orderId_key" ON "PartnerCommission"("partnerId", "orderId");
CREATE INDEX "PartnerCommission_partnerId_status_idx" ON "PartnerCommission"("partnerId", "status");
CREATE INDEX "PartnerCommission_availableAt_status_idx" ON "PartnerCommission"("availableAt", "status");
CREATE INDEX "PartnerCommission_withdrawalId_idx" ON "PartnerCommission"("withdrawalId");
ALTER TABLE "PartnerCommission" ADD CONSTRAINT "PartnerCommission_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: PartnerWithdrawal
CREATE TABLE "PartnerWithdrawal" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountRequested" DOUBLE PRECISION NOT NULL,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "amountNet" DOUBLE PRECISION NOT NULL,
    "payoutMethod" TEXT NOT NULL,
    "payoutTarget" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "processedAt" TIMESTAMP(3),
    "processedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerWithdrawal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerWithdrawal_partnerId_status_idx" ON "PartnerWithdrawal"("partnerId", "status");
CREATE INDEX "PartnerWithdrawal_status_createdAt_idx" ON "PartnerWithdrawal"("status", "createdAt");
ALTER TABLE "PartnerWithdrawal" ADD CONSTRAINT "PartnerWithdrawal_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
