import { createOrganizationShell } from "@workspace/organization/shell"

import { planForOrganization } from "@/lib/billing/plans"
import { prisma } from "@/lib/prisma"

const shell = createOrganizationShell({
  db: prisma,
  planForOrganization,
})

export const { getOrganizationShell } = shell
export type { OrganizationShell } from "@workspace/organization/shell"
