-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "newsletterWelcomeEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "newsletterWelcomeMessage" TEXT;

