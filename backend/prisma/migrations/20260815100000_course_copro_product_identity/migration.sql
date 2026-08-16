-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "coproducerId" TEXT;

-- AlterTable
ALTER TABLE "CredentialDelivery" ADD COLUMN     "productName" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "courseId" TEXT,
ADD COLUMN     "productName" TEXT,
ADD COLUMN     "productPid" TEXT;

-- CreateTable
CREATE TABLE "AdminEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminEvent_createdAt_idx" ON "AdminEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AdminEvent_type_idx" ON "AdminEvent"("type");

-- CreateIndex
CREATE INDEX "Course_coproducerId_idx" ON "Course"("coproducerId");

-- CreateIndex
CREATE INDEX "Transaction_courseId_idx" ON "Transaction"("courseId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_coproducerId_fkey" FOREIGN KEY ("coproducerId") REFERENCES "CoproducerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

