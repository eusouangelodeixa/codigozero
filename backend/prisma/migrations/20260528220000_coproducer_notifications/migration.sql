-- CoproducerAccount: 4 per-type notification toggles
ALTER TABLE "CoproducerAccount"
  ADD COLUMN "notifySale"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyRenewal"         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyLead"            BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyCredentialFail"  BOOLEAN NOT NULL DEFAULT true;

-- NotificationLog: per-user history of pushes (or attempts thereof)
CREATE TABLE "NotificationLog" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "body"      TEXT NOT NULL,
  "url"       TEXT,
  "delivered" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationLog_userId_createdAt_idx"
  ON "NotificationLog"("userId", "createdAt");

ALTER TABLE "NotificationLog"
  ADD CONSTRAINT "NotificationLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
