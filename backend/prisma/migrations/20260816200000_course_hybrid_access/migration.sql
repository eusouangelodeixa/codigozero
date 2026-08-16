-- AlterTable
ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "includedInSubscription" BOOLEAN NOT NULL DEFAULT true;


-- Backfill: cursos que eram 'paid' (vendidos à parte) NÃO eram incluídos na
-- assinatura — preserva o comportamento atual. Os 'subscription' ficam com o
-- default true. A partir daqui os dois eixos são editáveis de forma independente.
UPDATE "Course" SET "includedInSubscription" = false WHERE "accessType" = 'paid';
