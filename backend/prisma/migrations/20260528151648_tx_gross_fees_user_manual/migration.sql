-- AlterTable: Transaction gains gross + fees breakdown
ALTER TABLE "Transaction" ADD COLUMN "grossAmount"   DOUBLE PRECISION;
ALTER TABLE "Transaction" ADD COLUMN "lojouFee"      DOUBLE PRECISION;
ALTER TABLE "Transaction" ADD COLUMN "coproducerFee" DOUBLE PRECISION;

-- AlterTable: User gains grantedManually flag — comped/trial subs that
-- shouldn't count toward revenue/MRR
ALTER TABLE "User" ADD COLUMN "grantedManually" BOOLEAN NOT NULL DEFAULT false;
