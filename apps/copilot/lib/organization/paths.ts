import { headers } from "next/headers"

import {
  createOrganizationPaths,
  organizationPath,
} from "@workspace/organization/paths"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const paths = createOrganizationPaths({
  auth,
  db: prisma,
  getHeaders: async () => headers(),
})

export const { getActiveOrgSlug, revalidateOrgPath } = paths
export { organizationPath }
