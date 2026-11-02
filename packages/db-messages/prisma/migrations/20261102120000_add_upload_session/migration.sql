-- CreateTable
CREATE TABLE "uploadSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'other',
    "mimeType" TEXT,
    "oid" BIGINT NOT NULL,
    "expectedSize" INTEGER,
    "receivedBytes" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "transient" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploadSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "uploadSession_organizationId_status_idx" ON "uploadSession"("organizationId", "status");

-- CreateIndex
CREATE INDEX "uploadSession_expiresAt_idx" ON "uploadSession"("expiresAt");
