-- AlterTable: CoproducerAccount gains VSL embed override + head scripts
ALTER TABLE "CoproducerAccount" ADD COLUMN "vslEmbedHtml" TEXT;
ALTER TABLE "CoproducerAccount" ADD COLUMN "headScripts"  TEXT;
