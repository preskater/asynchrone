import type { RequestContext } from "@workspace/core/context"
import {
  AppearanceService,
  type AppearanceStore,
  type OrganizationAppearance,
} from "@workspace/appearance"

import { prisma } from "@/lib/prisma"

/**
 * Copilot's adapter for `@workspace/appearance`.
 *
 * The identity database owns organization metadata, so only this app passes a
 * store to the shared service. Domain apps read the same preferences through
 * Copilot's internal API instead of opening this database.
 */
const store: AppearanceStore = {
  async findMetadata(organizationId) {
    return prisma.organization.findUnique({
      where: { id: organizationId },
      select: { metadata: true },
    })
  },
  async updateMetadata(organizationId, metadata) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { metadata },
    })
  },
}

const appearanceService = new AppearanceService(store)

/** Reads the effective appearance for an organization. */
export function getOrganizationAppearance(
  organizationId: string
): Promise<OrganizationAppearance> {
  return appearanceService.read(organizationId)
}

/**
 * Persists the appearance for the caller's active organization. Only owners
 * and admins may change it; other metadata keys (e.g. `plan`) are preserved.
 */
export function updateOrganizationAppearance(
  ctx: RequestContext,
  appearance: OrganizationAppearance
): Promise<OrganizationAppearance> {
  return appearanceService.update(ctx, appearance)
}
