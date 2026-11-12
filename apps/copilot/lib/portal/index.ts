import { Readable } from "node:stream"
import { headers } from "next/headers"
import { z } from "zod"

import { createPortalRuntime } from "@workspace/portal"
import type {
  PortalContext,
  PortalTaskDetailData,
} from "@workspace/portal/types"
import type { PortalMeetingsData } from "@workspace/meetings/types"

import { auth } from "@/lib/auth"
import {
  callDomain,
  delegatedContext,
  delegatedPortalContext,
  domainServiceFetch,
  requireDomainClient,
} from "@/lib/internal/domain"
import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

/**
 * Copilot's binding of `@workspace/portal`.
 *
 * Identity rows, the large-object store, Better Auth invitations and
 * notifications stay in Copilot. Projects, clients, files and meetings are read
 * through the owning app's internal API with a delegated portal context, so the
 * target app enforces client visibility and writes its own audit rows.
 */

function portalContext(
  organizationId: string,
  clientId: string,
  overrides: Partial<PortalContext> = {}
): PortalContext {
  return {
    userId: overrides.userId ?? "system",
    userName: overrides.userName ?? "Portal",
    userEmail: overrides.userEmail ?? "portal@asynchrone.space",
    organizationId,
    organizationName: overrides.organizationName ?? "",
    organizationSlug: overrides.organizationSlug ?? "",
    clientId,
    clientName: overrides.clientName || "Portal client",
  }
}

const quotaResult = z.object({
  quotaBytes: z.number(),
  usedBytes: z.number(),
})

const runtime = createPortalRuntime({
  db: prisma,
  files: {
    createUploadedFile: async (ctx, input) => {
      const search = new URLSearchParams({
        organizationId: ctx.organizationId,
        name: input.name,
        sizeBytes: String(input.sizeBytes),
      })
      if (input.mimeType) search.set("mimeType", input.mimeType)
      const response = await domainServiceFetch(
        "files",
        `/internal/v1/files/upload?${search.toString()}`,
        {
          method: "POST",
          body: Readable.toWeb(input.stream) as ReadableStream,
          headers: {
            "Content-Type": "application/octet-stream",
            "x-user-id": ctx.userId,
            "x-user-name": ctx.userName,
            "x-user-email": ctx.userEmail,
            "x-user-role": ctx.role,
          },
          scope: "internal:domain:write",
          duplex: "half",
        } as RequestInit & { scope: "internal:domain:write" }
      )
      if (!response.ok) {
        throw new Error(`The files app refused the upload (${response.status})`)
      }
      const body = (await response.json()) as { data: { id: string } }
      return { id: body.data.id }
    },
    openDocument: async (organizationId, fileId, metadata) => {
      const response = await domainServiceFetch(
        "files",
        `/internal/v1/files/${encodeURIComponent(fileId)}/content?organizationId=${encodeURIComponent(organizationId)}`,
        { scope: "internal:export:read" }
      )
      if (!response.ok || !response.body) {
        throw new Error(`The files app has no bytes for ${fileId}`)
      }
      const size = Number(response.headers.get("content-length") ?? 0)
      return {
        name: metadata.name,
        mimeType: metadata.mimeType,
        size,
        stream: Readable.fromWeb(
          response.body as import("node:stream/web").ReadableStream
        ),
      }
    },
    quotaBytes: async (organizationId) => {
      const quota = await callDomain(
        "files",
        "get-file-quota",
        delegatedPortalContext(portalContext(organizationId, "system")),
        {},
        quotaResult
      )
      return quota.quotaBytes
    },
    usedBytes: async (organizationId) => {
      const quota = await callDomain(
        "files",
        "get-file-quota",
        delegatedPortalContext(portalContext(organizationId, "system")),
        {},
        quotaResult
      )
      return quota.usedBytes
    },
  },
  projects: {
    listProjects: (organizationId, clientId) =>
      requireDomainClient("projects").listPortalProjects(
        delegatedPortalContext(portalContext(organizationId, clientId))
      ),
    listUnreadMessages: (organizationId, clientId, projectIds, userId, since) =>
      requireDomainClient("projects").listPortalUnreadMessages(
        delegatedPortalContext(
          portalContext(organizationId, clientId, { userId })
        ),
        projectIds,
        since ? since.toISOString() : null
      ),
    findProject: (organizationId, clientId, projectId) =>
      requireDomainClient("projects").getPortalProject(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        projectId
      ),
    findProjectPolicy: async (organizationId, clientId, projectId) => {
      const project = await requireDomainClient("projects").getPortalProject(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        projectId
      )
      if (!project) return null
      return {
        clientDiscussion: project.discussionPolicy,
        clientTaskComments: project.taskCommentsPolicy,
      }
    },
    findProjectTask: async (organizationId, clientId, projectId, taskId) => {
      const task = await requireDomainClient("projects").getPortalTask(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        projectId,
        taskId
      )
      if (!task) return null
      return {
        ...task,
        status: task.status as PortalTaskDetailData["status"],
        priority: task.priority as PortalTaskDetailData["priority"],
      }
    },
    findTask: async (organizationId, clientId, projectId, taskId) => {
      const task = await requireDomainClient("projects").getPortalTask(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        projectId,
        taskId
      )
      return task ? { id: task.id } : null
    },
  },
  clientDocuments: {
    listDocuments: (organizationId, clientId) =>
      requireDomainClient("clients").listPortalDocuments(
        delegatedPortalContext(portalContext(organizationId, clientId))
      ),
    listReleaseReports: (organizationId, clientId) =>
      requireDomainClient("clients").listPortalReleaseReports(
        delegatedPortalContext(portalContext(organizationId, clientId))
      ),
    getReleaseReport: (organizationId, clientId, releaseId) =>
      requireDomainClient("clients").getPortalReleaseReport(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        releaseId
      ),
    findDocumentLink: (organizationId, clientId, fileId) =>
      requireDomainClient("clients").getPortalDocument(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        fileId
      ),
    createDocument: (input) =>
      requireDomainClient("clients").createPortalDocument(
        delegatedPortalContext(
          portalContext(input.organizationId, input.clientId, {
            userId: input.addedBy,
            userName: input.addedByName,
            userEmail: input.addedByEmail,
          })
        ),
        {
          fileId: input.fileId,
          name: input.name,
          sizeBytes: input.sizeBytes,
        }
      ),
    findClient: (organizationId, clientId) =>
      requireDomainClient("clients").getPortalClient(
        delegatedPortalContext(portalContext(organizationId, clientId))
      ),
    findClientInOrganization: async (organizationId, clientId) => {
      const client = await requireDomainClient("clients").getPortalClient(
        delegatedPortalContext(portalContext(organizationId, clientId))
      )
      return client ? { id: client.id } : null
    },
  },
  collaboration: {
    listMessages: (organizationId, clientId, projectId) =>
      requireDomainClient("projects").listPortalMessages(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        projectId
      ),
    createMessage: (input) =>
      requireDomainClient("projects").createPortalMessage(
        delegatedPortalContext(
          portalContext(input.organizationId, input.clientId, {
            userId: input.authorId,
            userName: input.authorName,
            clientName: input.clientName,
          })
        ),
        input.projectId,
        input.body
      ),
    listTaskComments: (organizationId, clientId, taskId) =>
      requireDomainClient("projects").listPortalTaskComments(
        delegatedPortalContext(portalContext(organizationId, clientId)),
        taskId
      ),
    createTaskComment: (input) =>
      requireDomainClient("projects").createPortalTaskComment(
        delegatedPortalContext(
          portalContext(input.organizationId, input.clientId, {
            userId: input.authorId,
            userName: input.authorName ?? "Portal",
            clientName: input.clientName,
          })
        ),
        input.taskId,
        input.body
      ),
  },
  meetings: {
    getPortalMeetings: async (ctx) =>
      (await requireDomainClient("calendars").getPortalMeetings(
        delegatedPortalContext(ctx)
      )) as unknown as PortalMeetingsData,
  },
  invitations: {
    create: async (organizationId, email) => {
      const invitation = await auth.api.createInvitation({
        headers: await headers(),
        body: { organizationId, email, role: "client" },
      })
      return { id: invitation.id }
    },
    cancel: async (invitationId) => {
      await auth.api.cancelInvitation({
        headers: await headers(),
        body: { invitationId },
      })
    },
    currentUser: async () => {
      const session = await auth.api.getSession({ headers: await headers() })
      return session ? { id: session.user.id, email: session.user.email } : null
    },
  },
  notify: (args) => notificationService.notify(args),
})

export const portalService = runtime.service
export const portalRepository = runtime.repository

export { MAX_PORTAL_UPLOAD_BYTES } from "@workspace/portal"
export { getPortalContext, isPortalMember } from "@/lib/core/auth-context"
export type { PortalContext } from "@workspace/portal/types"
export * from "@workspace/portal/schemas"
