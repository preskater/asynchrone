-- CreateTable
CREATE TABLE "projectGuest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "capabilities" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projectGuest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projectGuest_tokenHash_key" ON "projectGuest"("tokenHash");

-- CreateIndex
CREATE INDEX "projectGuest_organizationId_projectId_idx" ON "projectGuest"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "projectGuest_userId_idx" ON "projectGuest"("userId");

-- CreateIndex
CREATE INDEX "projectGuest_email_idx" ON "projectGuest"("email");

-- AddForeignKey
ALTER TABLE "projectGuest" ADD CONSTRAINT "projectGuest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projectGuest" ADD CONSTRAINT "projectGuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
