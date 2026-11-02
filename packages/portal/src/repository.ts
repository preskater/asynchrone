import type { PrismaClient } from "@workspace/db-identity"

/**
 * The slice of a Prisma client the portal domain needs.
 *
 * The package never opens a connection: Copilot binds its identity client for
 * `member`/`user`/`portalInvite` and the "new since last visit" state. Project,
 * task, client and document reads go through the projects and clients internal
 * APIs (`PortalProjects`, `PortalClientDocuments`), never this client.
 */
export type PortalDb = Pick<
  PrismaClient,
  "member" | "user" | "portalInvite" | "$transaction" | "$queryRaw"
>

/**
 * Every portal read and write lives here, scoped by organization and (for
 * client-facing queries) by the caller's client company. The service decides
 * the rules; the repository only spells out the queries.
 */
export class PortalRepository {
  constructor(public readonly db: PortalDb) {}

  // Visibility state
  // ---------------------------------------------------------------------------

  lastSeenAt(organizationId: string, userId: string) {
    return this.db.member.findFirst({
      where: { organizationId, userId },
      select: { portalLastSeenAt: true },
    })
  }

  markSeen(organizationId: string, userId: string) {
    return this.db.member.updateMany({
      where: { organizationId, userId },
      data: { portalLastSeenAt: new Date() },
    })
  }

  // ---------------------------------------------------------------------------
  // Notifications
  // ---------------------------------------------------------------------------

  listClientAdmins(organizationId: string) {
    return this.db.member.findMany({
      where: {
        organizationId,
        clientId: null,
        role: { in: ["owner", "admin"] },
      },
      select: { userId: true },
    })
  }

  listUserNames(ids: string[]) {
    return this.db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    })
  }

  // ---------------------------------------------------------------------------
  // Access management (internal client side)
  // ---------------------------------------------------------------------------

  listAccessMembers(organizationId: string, clientId: string) {
    return this.db.member.findMany({
      where: { organizationId, clientId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    })
  }

  listPendingInvites(organizationId: string, clientId: string) {
    return this.db.portalInvite.findMany({
      where: { organizationId, clientId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    })
  }

  findMemberByEmail(organizationId: string, email: string) {
    return this.db.member.findFirst({
      where: { organizationId, user: { email } },
      select: { id: true },
    })
  }

  findPendingInvite(organizationId: string, clientId: string, email: string) {
    return this.db.portalInvite.findFirst({
      where: { organizationId, clientId, email, acceptedAt: null },
      select: { id: true },
    })
  }

  createInvite(input: {
    organizationId: string
    clientId: string
    email: string
    name: string | null
    invitationId: string
    invitedById: string
  }) {
    return this.db.portalInvite.create({
      data: input,
      select: { id: true, email: true },
    })
  }

  findAccessMember(organizationId: string, memberId: string) {
    return this.db.member.findFirst({
      where: {
        id: memberId,
        organizationId,
        clientId: { not: null },
      },
      select: { id: true },
    })
  }

  deleteMember(memberId: string) {
    return this.db.member.delete({ where: { id: memberId } })
  }

  findInvite(organizationId: string, inviteId: string) {
    return this.db.portalInvite.findFirst({
      where: { id: inviteId, organizationId },
      select: { id: true, invitationId: true },
    })
  }

  deleteInvite(inviteId: string) {
    return this.db.portalInvite.delete({ where: { id: inviteId } })
  }

  // ---------------------------------------------------------------------------
  // Invitation claim
  // ---------------------------------------------------------------------------

  findClaimInvite(invitationId: string) {
    return this.db.portalInvite.findFirst({
      where: { invitationId, acceptedAt: null },
      select: { id: true, organizationId: true, clientId: true, email: true },
    })
  }

  findMemberForUser(organizationId: string, userId: string) {
    return this.db.member.findFirst({
      where: { organizationId, userId },
      select: { id: true, clientId: true },
    })
  }

  updateMemberClient(memberId: string, clientId: string) {
    return this.db.member.update({
      where: { id: memberId },
      data: { clientId, role: "client" },
    })
  }

  markInviteAccepted(inviteId: string) {
    return this.db.portalInvite.update({
      where: { id: inviteId },
      data: { acceptedAt: new Date() },
    })
  }
}
