-- SystemConfig: replace Komunika remarketing FUNNEL ids with SDR outbound
-- ASSISTANT ids. The funnel "add-lead" mechanism is being replaced by the
-- SDR outbound "initiate" endpoint. All nullable.
ALTER TABLE "SystemConfig" DROP COLUMN IF EXISTS "komunikaVisitorFunnelId";
ALTER TABLE "SystemConfig" DROP COLUMN IF EXISTS "komunikaCheckoutFunnelId";
ALTER TABLE "SystemConfig" ADD COLUMN "komunikaVisitorAssistantId" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "komunikaCheckoutAssistantId" TEXT;
