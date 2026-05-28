-- AlterTable: Transaction gains isRenewal flag for new vs renewal split
ALTER TABLE "Transaction" ADD COLUMN "isRenewal" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: a transaction is a renewal if there's another approved
-- transaction for the same userEmail with an earlier createdAt.
UPDATE "Transaction" t
SET "isRenewal" = true
WHERE t.status = 'approved'
  AND t."userEmail" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Transaction" prev
    WHERE prev.status = 'approved'
      AND prev."userEmail" = t."userEmail"
      AND prev."createdAt" < t."createdAt"
  );
