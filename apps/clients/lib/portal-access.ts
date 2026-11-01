import type { PortalAccessData } from "@workspace/clients/portal"

import { prisma } from "@/lib/prisma"

/**
 * Portal users and pending invitations of one client company.
 *
 * The read model is the one Copilot's portal service exposes; the portal itself
 * (and the Better Auth invitations behind it) stays in Copilot, so this app
 * shows the list read-only until #171 exposes the invitation API. Every query
 * is scoped to the organization, never to an id from the client.
 */
export async function getPortalAccess(
  organizationId: string,
  clientId: string
): Promise<PortalAccessData> {
  const [members, invites] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId, clientId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.portalInvite.findMany({
      where: { organizationId, clientId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ])

  return {
    members: members.map((member) => ({
      memberId: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      createdAt: member.createdAt.toISOString(),
    })),
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      name: invite.name ?? undefined,
      createdAt: invite.createdAt.toISOString(),
      invitationId: invite.invitationId ?? undefined,
    })),
  }
}
