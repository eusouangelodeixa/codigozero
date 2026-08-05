-- CreateTable
CREATE TABLE "GroupRemovalQueue" (
    "id" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "requestedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GroupRemovalQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupRemovalQueue_status_createdAt_idx" ON "GroupRemovalQueue"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GroupRemovalQueue_jid_status_idx" ON "GroupRemovalQueue"("jid", "status");

