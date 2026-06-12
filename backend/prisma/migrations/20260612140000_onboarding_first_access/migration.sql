-- Post-purchase onboarding / first platform access tracking.
ALTER TABLE "User" ADD COLUMN "firstAccessAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "welcomeSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "onboardingNudgeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lastOnboardingNudgeAt" TIMESTAMP(3);

-- Backfill: every user that already exists predates this feature, so treat them
-- as already-accessed (and welcome already sent) to avoid spamming the existing
-- base with onboarding nudges / welcome messages. Only NEW buyers created after
-- this migration start with NULL firstAccessAt and enter the onboarding flow.
UPDATE "User"
SET "firstAccessAt" = COALESCE("subscriptionStart", "createdAt"),
    "welcomeSentAt"  = COALESCE("subscriptionStart", "createdAt");
