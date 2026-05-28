-- User: Stripe IDs
ALTER TABLE "User"
  ADD COLUMN "stripeCustomerId"     TEXT,
  ADD COLUMN "stripeSubscriptionId" TEXT;
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- Transaction: gateway + Stripe refs
ALTER TABLE "Transaction"
  ADD COLUMN "gateway"               TEXT NOT NULL DEFAULT 'lojou',
  ADD COLUMN "stripePaymentIntentId" TEXT,
  ADD COLUMN "stripeInvoiceId"       TEXT;
