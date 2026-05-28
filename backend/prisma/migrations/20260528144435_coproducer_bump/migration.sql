-- AlterTable: CoproducerAccount gains optional bump product + price
ALTER TABLE "CoproducerAccount" ADD COLUMN "bumpProductPid" TEXT;
ALTER TABLE "CoproducerAccount" ADD COLUMN "bumpPrice" DOUBLE PRECISION;
