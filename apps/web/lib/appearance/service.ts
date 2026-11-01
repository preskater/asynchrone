import { prisma } from "@/lib/prisma"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import type { RequestContext } from "@workspace/core/context"
import { roleRank, ROLE_RANK } from "@workspace/organization/roles"

import {
  parseOrganizationAppearance,
  parseOrganizationMetadata,
  type OrganizationAppearance,
} from "./types"

/** Reads the effective appearance for an organization. */
export async function getOrganizationAppearance(
  organizationId: string
): Promise<OrganizationAppearance> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { metadata: true },
  })
  return parseOrganizationAppearance(organization?.metadata ?? null)
}

/**
 * Persists the appearance for the caller's active organization. Only owners
 * and admins may change it; other metadata keys (e.g. `plan`) are preserved.
 */
export async function updateOrganizationAppearance(
  ctx: RequestContext,
  appearance: OrganizationAppearance
): Promise<OrganizationAppearance> {
  if (roleRank(ctx.role) < ROLE_RANK.admin) {
    throw new ForbiddenError(
      "Only owners and admins can change the organization appearance."
    )
  }

  const organization = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { metadata: true },
  })
  if (!organization) throw new NotFoundError("Organization")

  const metadata = parseOrganizationMetadata(organization.metadata)
  metadata.appearance = appearance

  await prisma.organization.update({
    where: { id: ctx.organizationId },
    data: { metadata: JSON.stringify(metadata) },
  })

  return appearance
}
