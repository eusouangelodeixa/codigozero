-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member';

-- CreateTable
CREATE TABLE "LandingConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "vslEmbedUrl" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "heroDesc" TEXT,
    "ctaText" TEXT,
    "priceAmount" INTEGER NOT NULL DEFAULT 797,
    "maxVagas" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingConfig_pkey" PRIMARY KEY ("id")
);
