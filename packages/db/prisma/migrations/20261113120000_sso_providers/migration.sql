-- Per-organization SSO providers (Better Auth sso plugin, issue #93) and the
-- SSO-only sign-in switch. Additive: one column with a default, one table.
-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "ssoEnforced" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ssoProvider" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "oidcConfig" TEXT,
    "samlConfig" TEXT,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "organizationId" TEXT,
    "domain" TEXT NOT NULL,
    "domainVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "ssoProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ssoProvider_providerId_key" ON "ssoProvider"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ssoProvider_organizationId_key" ON "ssoProvider"("organizationId");

-- CreateIndex
CREATE INDEX "ssoProvider_domain_idx" ON "ssoProvider"("domain");

-- AddForeignKey
ALTER TABLE "ssoProvider" ADD CONSTRAINT "ssoProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssoProvider" ADD CONSTRAINT "ssoProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

