-- AlterTable: optional link from DispatchLog rows back to the parent schedule
ALTER TABLE "DispatchLog" ADD COLUMN "scheduleId" TEXT;
CREATE INDEX "DispatchLog_scheduleId_idx" ON "DispatchLog"("scheduleId");

-- CreateTable
CREATE TABLE "ScheduledDispatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledDispatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledDispatch_status_scheduledAt_idx" ON "ScheduledDispatch"("status", "scheduledAt");
CREATE INDEX "ScheduledDispatch_userId_createdAt_idx" ON "ScheduledDispatch"("userId", "createdAt");

ALTER TABLE "ScheduledDispatch"
  ADD CONSTRAINT "ScheduledDispatch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
