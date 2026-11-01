import { prisma } from "@/lib/prisma"

/**
 * Revoke every OAuth grant for a user. Called when the active organization
 * changes or a member role changes: tokens are bound to the organization and
 * must not survive a context switch.
 */
export async function revokeOauthTokensForUser(userId: string): Promise<void> {
  const now = new Date()
  await prisma.$transaction([
    prisma.oauthRefreshToken.updateMany({
      where: { userId, revoked: null },
      data: { revoked: now },
    }),
    prisma.oauthAccessToken.updateMany({
      where: { userId, revoked: null },
      data: { revoked: now },
    }),
  ])
}

/** Revoke grants bound to a session, used on sign-out. */
export async function revokeOauthTokensForSession(
  sessionId: string
): Promise<void> {
  const now = new Date()
  await prisma.$transaction([
    prisma.oauthRefreshToken.updateMany({
      where: { sessionId, revoked: null },
      data: { revoked: now },
    }),
    prisma.oauthAccessToken.updateMany({
      where: { sessionId, revoked: null },
      data: { revoked: now },
    }),
  ])
}
