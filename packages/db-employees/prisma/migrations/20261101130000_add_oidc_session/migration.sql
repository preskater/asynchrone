-- CreateTable
CREATE TABLE "oidcSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oidcSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "oidcSession_sid_idx" ON "oidcSession"("sid");

-- CreateIndex
CREATE INDEX "oidcSession_userId_idx" ON "oidcSession"("userId");
