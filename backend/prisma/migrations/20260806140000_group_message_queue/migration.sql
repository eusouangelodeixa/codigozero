-- CreateTable
CREATE TABLE "GroupMessageQueue" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT,
    "mediaUrl" TEXT,
    "mentionAll" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdBy" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMessageQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupMessageQueue_status_scheduledAt_idx" ON "GroupMessageQueue"("status", "scheduledAt");

