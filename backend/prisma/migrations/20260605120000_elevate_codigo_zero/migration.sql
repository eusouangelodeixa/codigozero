-- AlterTable: User — PWA install tracking + per-channel notification prefs
ALTER TABLE "User" ADD COLUMN "pwaInstalledAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pwaReminderSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "notifyCommunity" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyPromotions" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifySystem" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyExpiration" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: ScrapeJob — campaign label + soft archive
ALTER TABLE "ScrapeJob" ADD COLUMN "name" TEXT;
ALTER TABLE "ScrapeJob" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: LandingConfig — default price 797 -> 497 (existing rows untouched)
ALTER TABLE "LandingConfig" ALTER COLUMN "priceAmount" SET DEFAULT 497;

-- CreateTable: OtpCode — WhatsApp one-time verification codes
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpCode_phone_purpose_idx" ON "OtpCode"("phone", "purpose");
