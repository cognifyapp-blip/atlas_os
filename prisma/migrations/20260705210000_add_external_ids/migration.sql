-- Add externalId columns for Clerk sync
-- users.externalId maps to Clerk's user_xxx ID
-- organizations.externalId maps to Clerk's org_xxx ID

ALTER TABLE "users" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "users_externalId_key" ON "users"("externalId");

ALTER TABLE "organizations" ADD COLUMN "externalId" TEXT;
CREATE UNIQUE INDEX "organizations_externalId_key" ON "organizations"("externalId");
