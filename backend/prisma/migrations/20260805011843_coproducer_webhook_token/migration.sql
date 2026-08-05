-- AlterTable
ALTER TABLE "CoproducerAccount" ADD COLUMN     "webhookToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CoproducerAccount_webhookToken_key" ON "CoproducerAccount"("webhookToken");

