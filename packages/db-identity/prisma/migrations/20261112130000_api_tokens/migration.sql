-- Personal access tokens for the /api/v1 API (issue #133, ADR 0042).
-- Additive: one new table, no changes to existing ones.

-- CreateTable
CREATE TABLE "apiToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "apiToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "apiToken_prefix_key" ON "apiToken"("prefix");

-- CreateIndex
CREATE INDEX "apiToken_organizationId_userId_idx" ON "apiToken"("organizationId", "userId");

-- AddForeignKey
ALTER TABLE "apiToken" ADD CONSTRAINT "apiToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apiToken" ADD CONSTRAINT "apiToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
