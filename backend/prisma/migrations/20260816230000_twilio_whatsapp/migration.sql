-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN IF NOT EXISTS "twilioAccountSid" TEXT,
ADD COLUMN IF NOT EXISTS "twilioAuthToken" TEXT,
ADD COLUMN IF NOT EXISTS "twilioEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "twilioMessagingServiceSid" TEXT,
ADD COLUMN IF NOT EXISTS "twilioTemplateSids" JSONB,
ADD COLUMN IF NOT EXISTS "twilioWhatsappFrom" TEXT;

