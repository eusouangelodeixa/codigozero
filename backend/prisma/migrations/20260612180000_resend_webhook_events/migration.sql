-- Resend webhook: signing secret + delivery-event log for the /admin/emails panel.
ALTER TABLE "SystemConfig" ADD COLUMN "resendWebhookSecret" TEXT;

CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "resendId" TEXT,
    "type" TEXT NOT NULL,
    "recipient" TEXT,
    "subject" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailEvent_createdAt_idx" ON "EmailEvent"("createdAt");
CREATE INDEX "EmailEvent_resendId_idx" ON "EmailEvent"("resendId");
