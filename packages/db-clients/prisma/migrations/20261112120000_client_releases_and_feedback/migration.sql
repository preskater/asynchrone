-- CreateTable
CREATE TABLE "clientRelease" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "projectId" TEXT,
    "version" TEXT NOT NULL,
    "label" TEXT,
    "releasedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "notes" TEXT,
    "portalVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "projectId" TEXT,
    "contactId" TEXT,
    "authorId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'staging',
    "category" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkedTaskId" TEXT,
    "documentId" TEXT,
    "version" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientRelease_organizationId_releasedAt_idx" ON "clientRelease"("organizationId", "releasedAt");

-- CreateIndex
CREATE UNIQUE INDEX "clientRelease_clientId_version_key" ON "clientRelease"("clientId", "version");

-- CreateIndex
CREATE INDEX "clientFeedback_organizationId_status_idx" ON "clientFeedback"("organizationId", "status");

-- CreateIndex
CREATE INDEX "clientFeedback_releaseId_testedAt_idx" ON "clientFeedback"("releaseId", "testedAt");

-- CreateIndex
CREATE INDEX "clientFeedback_clientId_idx" ON "clientFeedback"("clientId");

-- CreateIndex
CREATE INDEX "clientFeedback_contactId_idx" ON "clientFeedback"("contactId");

-- AddForeignKey
ALTER TABLE "clientRelease" ADD CONSTRAINT "clientRelease_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientFeedback" ADD CONSTRAINT "clientFeedback_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientFeedback" ADD CONSTRAINT "clientFeedback_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "clientRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientFeedback" ADD CONSTRAINT "clientFeedback_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

