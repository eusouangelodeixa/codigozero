-- AlterTable: User gets a referral pointer
ALTER TABLE "User" ADD COLUMN "referredByCode" TEXT;
CREATE INDEX "User_referredByCode_idx" ON "User"("referredByCode");

-- AlterTable: LandingConfig gets affiliate-specific overrides
ALTER TABLE "LandingConfig" ADD COLUMN "affiliateVslEmbedHtml" TEXT;
ALTER TABLE "LandingConfig" ADD COLUMN "affiliateCreativesUrl" TEXT;

-- CreateTable: AffiliateAccount
CREATE TABLE "AffiliateAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "payoutMethod" TEXT,
    "payoutTarget" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AffiliateAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AffiliateAccount_userId_key" ON "AffiliateAccount"("userId");
CREATE UNIQUE INDEX "AffiliateAccount_code_key" ON "AffiliateAccount"("code");
CREATE INDEX "AffiliateAccount_code_idx" ON "AffiliateAccount"("code");
ALTER TABLE "AffiliateAccount" ADD CONSTRAINT "AffiliateAccount_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AffiliateReferral
CREATE TABLE "AffiliateReferral" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateReferral_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AffiliateReferral_affiliateId_status_idx" ON "AffiliateReferral"("affiliateId", "status");
CREATE INDEX "AffiliateReferral_email_idx" ON "AffiliateReferral"("email");
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "AffiliateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AffiliateReferral" ADD CONSTRAINT "AffiliateReferral_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: AffiliateCommission
CREATE TABLE "AffiliateCommission" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "referralId" TEXT,
    "lojouOrderId" TEXT,
    "saleAmount" DOUBLE PRECISION NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "withdrawalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliateCommission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AffiliateCommission_affiliateId_status_idx" ON "AffiliateCommission"("affiliateId", "status");
CREATE INDEX "AffiliateCommission_availableAt_status_idx" ON "AffiliateCommission"("availableAt", "status");
CREATE INDEX "AffiliateCommission_withdrawalId_idx" ON "AffiliateCommission"("withdrawalId");
ALTER TABLE "AffiliateCommission" ADD CONSTRAINT "AffiliateCommission_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "AffiliateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AffiliateWithdrawal
CREATE TABLE "AffiliateWithdrawal" (
    "id" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
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
    CONSTRAINT "AffiliateWithdrawal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AffiliateWithdrawal_affiliateId_status_idx" ON "AffiliateWithdrawal"("affiliateId", "status");
CREATE INDEX "AffiliateWithdrawal_status_createdAt_idx" ON "AffiliateWithdrawal"("status", "createdAt");
ALTER TABLE "AffiliateWithdrawal" ADD CONSTRAINT "AffiliateWithdrawal_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "AffiliateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
