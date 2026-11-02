import { createAuthSession } from "@workspace/auth/session"

import { auth } from "@/lib/auth"
import { requireDomainClient } from "@/lib/internal/domain"
import { prisma } from "@/lib/prisma"

/**
 * App-side wiring for the shared session helpers: the package owns the
 * membership rules, this module binds them to Copilot's Better Auth instance
 * and identity database.
 */
export const {
  contextForMember,
  getRequestContext,
  getOptionalRequestContext,
  getRequestContextForOrganization,
  requirePermission,
  isPortalMember,
  getPortalContext,
} = createAuthSession({
  auth,
  db: prisma,
  resolveClientName: async (organizationId, clientId) => {
    try {
      const client = await requireDomainClient("clients").getPortalClient({
        userId: "portal",
        userName: "Portal",
        userEmail: "portal@asynchrone.space",
        organizationId,
        role: "client",
        impersonatedBy: null,
        portal: { clientId, clientName: "Portal" },
      })
      return client?.name ?? null
    } catch (error) {
      // The portal still works without the display name; never fail the
      // session because the clients app is briefly unavailable.
      console.error("[portal] client name unavailable", error)
      return null
    }
  },
})
