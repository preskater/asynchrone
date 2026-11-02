import { headers } from "next/headers"
import { after } from "next/server"

import {
  createOrganizationPaths,
  organizationPath,
} from "@workspace/organization/paths"
import { getCorrelationId } from "@workspace/observability/next"

import { auth } from "@/lib/auth"
import { invalidateDomainCaches } from "@/lib/internal/invalidate"
import { prisma } from "@/lib/prisma"

const paths = createOrganizationPaths({
  auth,
  db: prisma,
  getHeaders: async () => headers(),
})

export const { getActiveOrgSlug } = paths

/**
 * Revalidate Copilot's own organization subtree and, after the response is
 * sent, ask every domain app to revalidate it too.
 *
 * `revalidatePath` only affects the app that calls it. Copilot owns the shell
 * and the portal, so a mutation here (member, role, portal access, client
 * record) may change a read model the projects/calendars/files/messages/
 * clients/employees hosts render. The fan-out runs in `after()`: it never
 * delays the mutation and a failing app is logged, not surfaced (issue #170).
 */
export async function revalidateOrgPath(
  organizationId: string,
  path = ""
): Promise<void> {
  await paths.revalidateOrgPath(organizationId, path)

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true },
  })
  if (!organization) return

  const correlationId = await getCorrelationId()
  const fanOut = () =>
    invalidateDomainCaches({
      organizationId,
      organizationSlug: organization.slug,
      path,
      reason: `revalidateOrgPath:${path || "/"}`,
      correlationId,
    })

  try {
    after(fanOut)
  } catch {
    // Outside a request scope (a script, a test): run it inline.
    await fanOut()
  }
}

export { organizationPath }
