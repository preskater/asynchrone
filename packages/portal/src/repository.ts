import type { PrismaClient } from "@workspace/db"

/**
 * The slice of a Prisma client the portal domain needs.
 *
 * The package never opens a connection: the owning app binds its own client.
 * Today that is Copilot and the shared client; the portal keeps its routes in
 * Copilot after the split, so the same binding stays in place.
 *
 * `member`, `user` and `organization` are identity tables the dashboard, the
 * access list and the invitation flow still read directly. They move behind
 * the identity internal API with the rest of Copilot (#190).
 */
export type PortalDb = Pick<
  PrismaClient,
  | "project"
  | "projectMessage"
  | "task"
  | "clientDocument"
  | "client"
  | "member"
  | "user"
  | "portalInvite"
  | "$transaction"
  | "$queryRaw"
>

/**
 * Every portal read and write lives here, scoped by organization and (for
 * client-facing queries) by the caller's client company. The service decides
 * the rules; the repository only spells out the queries.
 */
export class PortalRepository {
  constructor(public readonly db: PortalDb) {}

  // ---------------------------------------------------------------------------
  // Client-facing reads
  // ---------------------------------------------------------------------------

  listDashboardProjects(organizationId: string, clientId: string) {
    return this.db.project.findMany({
      where: { organizationId, clientId, clientVisible: true },
      select: {
        id: true,
        name: true,
        status: true,
        dueDate: true,
        tasks: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    })
  }

  listUnreadMessages(
    organizationId: string,
    projectIds: string[],
    authorId: string,
    since: Date | null
  ) {
    return this.db.projectMessage.findMany({
      where: {
        organizationId,
        projectId: { in: projectIds },
        authorId: { not: authorId },
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      select: { projectId: true },
    })
  }

  listClientDocuments(organizationId: string, clientId: string) {
    return this.db.clientDocument.findMany({
      where: {
        organizationId,
        entity: "client",
        entityId: clientId,
        visibility: "client",
        file: { trashed: false },
      },
      select: {
        id: true,
        fileId: true,
        addedBy: true,
        file: { select: { name: true, sizeBytes: true } },
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })
  }

  findProject(organizationId: string, clientId: string, projectId: string) {
    return this.db.project.findFirst({
      where: { id: projectId, organizationId, clientId, clientVisible: true },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        dueDate: true,
        createdAt: true,
        clientDiscussion: true,
        clientTaskComments: true,
        tasks: {
          select: { id: true, title: true, status: true, dueDate: true },
          orderBy: { order: "asc" },
        },
      },
    })
  }

  findProjectPolicy(
    organizationId: string,
    clientId: string,
    projectId: string
  ) {
    return this.db.project.findFirst({
      where: { id: projectId, organizationId, clientId, clientVisible: true },
      select: {
        id: true,
        clientDiscussion: true,
        clientTaskComments: true,
      },
    })
  }

  findProjectTask(organizationId: string, projectId: string, taskId: string) {
    return this.db.task.findFirst({
      where: { id: taskId, projectId, organizationId },
      select: {
        id: true,
        identifier: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        dueDate: true,
        endDate: true,
        createdAt: true,
        subtasks: {
          select: { id: true, title: true, done: true },
          orderBy: { order: "asc" },
        },
        labels: { include: { label: { select: { name: true } } } },
      },
    })
  }

  findTask(organizationId: string, projectId: string, taskId: string) {
    return this.db.task.findFirst({
      where: { id: taskId, projectId, organizationId },
      select: { id: true },
    })
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  createClientDocument(input: {
    organizationId: string
    fileId: string
    clientId: string
    addedBy: string
  }) {
    return this.db.clientDocument.create({
      data: {
        organizationId: input.organizationId,
        fileId: input.fileId,
        entity: "client",
        entityId: input.clientId,
        visibility: "client",
        addedBy: input.addedBy,
      },
      select: { id: true, createdAt: true },
    })
  }

  /** The client-visible link that authorizes one portal download. */
  findClientDocumentLink(
    organizationId: string,
    clientId: string,
    fileId: string
  ) {
    return this.db.clientDocument.findFirst({
      where: {
        organizationId,
        entity: "client",
        entityId: clientId,
        visibility: "client",
        fileId,
      },
      select: {
        file: {
          select: { name: true, oid: true, mimeType: true, trashed: true },
        },
      },
    })
  }

  // ---------------------------------------------------------------------------
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

  findClient(clientId: string) {
    return this.db.client.findUnique({
      where: { id: clientId },
      select: { ownerId: true, name: true },
    })
  }

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

  findClientInOrganization(organizationId: string, clientId: string) {
    return this.db.client.findFirst({
      where: { id: clientId, organizationId },
      select: { id: true },
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
