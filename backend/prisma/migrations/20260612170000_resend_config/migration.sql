-- Resend e-mail config, editable from /admin/config (env fallback in code).
ALTER TABLE "SystemConfig" ADD COLUMN "resendApiKey" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "resendFrom" TEXT;
