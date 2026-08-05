-- CreateTable
CREATE TABLE "CentralAnnouncement" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentralAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentralAnnouncement_pageId_key" ON "CentralAnnouncement"("pageId");

-- CreateIndex
CREATE INDEX "CentralAnnouncement_status_dueAt_idx" ON "CentralAnnouncement"("status", "dueAt");

