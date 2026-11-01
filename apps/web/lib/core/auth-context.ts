import { createAuthSession } from "@workspace/auth/session"

import { auth } from "@/lib/auth"
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
} = createAuthSession({ auth, db: prisma })
