import { headers } from "next/headers"

import { createPortalRuntime } from "@workspace/portal"

import { auth } from "@/lib/auth"
import { recordUserAudit } from "@/lib/audit/record"
import { fileService, orgQuotaBytes, orgUsedBytes } from "@/lib/files"
import { largeObjectStore } from "@/lib/large-object"
import { meetingService } from "@/lib/meetings"
import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import {
  createProjectMessage,
  listProjectMessages,
} from "@/lib/projects/thread"
import {
  createTaskComment,
  listTaskComments,
} from "@/lib/projects/task-comments"

/**
 * Copilot's binding of `@workspace/portal`: the package owns the portal rules,
 * this module supplies the identity database, the large-object store, the files
 * service, the project thread, the meetings service, Better Auth invitations,
 * the audit writer and the notification inbox.
 *
 * The portal has no app of its own: its routes and APIs stay in Copilot.
 */
const runtime = createPortalRuntime({
  db: prisma,
  storage: largeObjectStore,
  files: {
    createUploadedFile: (ctx, input) =>
      fileService.createUploadedFile(ctx, input),
    quotaBytes: orgQuotaBytes,
    usedBytes: orgUsedBytes,
  },
  collaboration: {
    listMessages: listProjectMessages,
    createMessage: createProjectMessage,
    listTaskComments,
    createTaskComment,
  },
  meetings: {
    getPortalMeetings: (ctx) => meetingService.getPortalMeetings(ctx),
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
  audit: (ctx, input) => recordUserAudit(ctx, input),
  notify: (args) => notificationService.notify(args),
})

export const portalService = runtime.service
export const portalRepository = runtime.repository

export { MAX_PORTAL_UPLOAD_BYTES } from "@workspace/portal"
export { getPortalContext, isPortalMember } from "@/lib/core/auth-context"
export type { PortalContext } from "@workspace/portal/types"
export * from "@workspace/portal/schemas"
