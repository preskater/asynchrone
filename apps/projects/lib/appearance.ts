import {
  AppearanceService,
  type AppearanceStore,
  type OrganizationAppearance,
} from "@workspace/appearance"

import { prisma } from "@/lib/prisma"

/**
 * Organization appearance for the projects shell.
 *
 * Appearance lives in organization metadata, which the identity database owns.
 * The pilot reads it through the shared client; a domain app reads the same
 * preferences through Copilot's internal API after #190.
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

export function getOrganizationAppearance(
  organizationId: string
): Promise<OrganizationAppearance> {
  return appearanceService.read(organizationId)
}
