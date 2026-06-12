-- Fix: the onboarding migration backfilled firstAccessAt/welcomeSentAt for ALL
-- users (no WHERE clause), so landing-page leads — who have never accessed the
-- platform and haven't bought — were wrongly marked as "already accessed".
-- Clear it for leads: they should show "—" in the admin list, and a lead that
-- later converts to a buyer must go through the real first-access + welcome flow.
UPDATE "User"
SET "firstAccessAt" = NULL,
    "welcomeSentAt"  = NULL
WHERE "subscriptionStatus" = 'lead';
