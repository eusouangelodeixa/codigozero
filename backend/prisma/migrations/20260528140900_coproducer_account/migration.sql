-- AlterTable: User gains coproducer attribution pointer
ALTER TABLE "User" ADD COLUMN "referredByCoproducer" TEXT;
CREATE INDEX "User_referredByCoproducer_idx" ON "User"("referredByCoproducer");

-- AlterTable: Transaction gains coproducer FK (NULL = principal product)
ALTER TABLE "Transaction" ADD COLUMN "coproducerId" TEXT;
CREATE INDEX "Transaction_coproducerId_idx" ON "Transaction"("coproducerId");

-- CreateTable: CoproducerAccount
CREATE TABLE "CoproducerAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productPid" TEXT NOT NULL,
    "planId" TEXT,
    "publicCheckoutUrl" TEXT,
    "sharePct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "displayName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoproducerAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoproducerAccount_userId_key" ON "CoproducerAccount"("userId");
CREATE UNIQUE INDEX "CoproducerAccount_code_key" ON "CoproducerAccount"("code");
CREATE UNIQUE INDEX "CoproducerAccount_productPid_key" ON "CoproducerAccount"("productPid");
CREATE INDEX "CoproducerAccount_enabled_idx" ON "CoproducerAccount"("enabled");

-- Foreign keys
ALTER TABLE "CoproducerAccount" ADD CONSTRAINT "CoproducerAccount_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_coproducerId_fkey"
    FOREIGN KEY ("coproducerId") REFERENCES "CoproducerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
