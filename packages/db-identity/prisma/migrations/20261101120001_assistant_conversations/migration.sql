-- Persisted Copilot assistant conversations (issue #165).
-- Additive: two new tables, no changes to existing ones.

CREATE TABLE "assistantConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistantConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistantConversation_organizationId_userId_updatedAt_idx" ON "assistantConversation"("organizationId", "userId", "updatedAt");

ALTER TABLE "assistantConversation" ADD CONSTRAINT "assistantConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assistantConversation" ADD CONSTRAINT "assistantConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "assistantMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistantMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "assistantMessage_conversationId_createdAt_idx" ON "assistantMessage"("conversationId", "createdAt");

ALTER TABLE "assistantMessage" ADD CONSTRAINT "assistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
