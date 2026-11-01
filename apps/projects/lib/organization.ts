import { createOrganizationShell } from "@workspace/organization/shell"
import { planForOrganization } from "@workspace/billing/plans"

import { prisma } from "@/lib/prisma"

/**
 * Organization state for the projects shell.
 *
 * The pilot reads the identity tables through the shared client (see
 * `lib/prisma.ts`); after #190 these calls become the identity internal API.
 */
const shell = createOrganizationShell({ db: prisma, planForOrganization })

export const getOrganizationShell = shell.getOrganizationShell

export type { OrganizationShell } from "@workspace/organization/shell"

/** Organizations the user can open, used by the workspace resolver and switcher. */
export function listUserOrganizations(userId: string) {
  return prisma.member.findMany({
    where: { userId, clientId: null },
    select: {
      organization: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { organization: { name: "asc" } },
  })
}

/** Client-portal accounts never reach the internal workspace. */
export async function isPortalMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const member = await prisma.member.findFirst({
    where: { organizationId, userId, clientId: { not: null } },
    select: { id: true },
  })
  return Boolean(member)
}
