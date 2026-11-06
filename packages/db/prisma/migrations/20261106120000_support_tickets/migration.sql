-- Support tickets filed from the in-app "Contact support" form (issue #101).
-- Additive: one new table, no changes to existing ones.

-- CreateTable
CREATE TABLE "supportTicket" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "category" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "allowContact" BOOLEAN NOT NULL DEFAULT true,
    "details" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "assigneeEmail" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supportTicket_number_key" ON "supportTicket"("number");

-- CreateIndex
CREATE INDEX "supportTicket_status_createdAt_idx" ON "supportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "supportTicket_organizationId_createdAt_idx" ON "supportTicket"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "supportTicket" ADD CONSTRAINT "supportTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supportTicket" ADD CONSTRAINT "supportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

