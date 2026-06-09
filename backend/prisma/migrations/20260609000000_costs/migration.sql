-- Cost ledger (expenses)
CREATE TABLE "Cost" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'outro',
    "allocation" TEXT NOT NULL DEFAULT 'company',
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Cost_incurredAt_idx" ON "Cost"("incurredAt");
CREATE INDEX "Cost_allocation_idx" ON "Cost"("allocation");
ALTER TABLE "Cost" ADD CONSTRAINT "Cost_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Per-partner share of a "shared" cost (a debit against their available pool)
CREATE TABLE "PartnerCostShare" (
    "id" TEXT NOT NULL,
    "costId" TEXT,
    "partnerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sharePct" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "withdrawalId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartnerCostShare_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartnerCostShare_partnerId_status_idx" ON "PartnerCostShare"("partnerId", "status");
CREATE INDEX "PartnerCostShare_costId_idx" ON "PartnerCostShare"("costId");
ALTER TABLE "PartnerCostShare" ADD CONSTRAINT "PartnerCostShare_costId_fkey"
  FOREIGN KEY ("costId") REFERENCES "Cost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerCostShare" ADD CONSTRAINT "PartnerCostShare_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "PartnerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
