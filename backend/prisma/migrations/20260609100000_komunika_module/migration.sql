-- User: Komunika embedded module (provision + SSO) tenant mapping.
-- All nullable — the vast majority of users never buy the add-on.
ALTER TABLE "User"
  ADD COLUMN "komunikaCompanyId"       TEXT,
  ADD COLUMN "komunikaUserId"          TEXT,
  ADD COLUMN "komunikaProvisionedAt"   TIMESTAMP(3),
  ADD COLUMN "komunikaDeprovisionedAt" TIMESTAMP(3);

-- Fast lookup of provisioned tenants (e.g. SSO eligibility, admin filters).
CREATE INDEX "User_komunikaCompanyId_idx" ON "User"("komunikaCompanyId");
