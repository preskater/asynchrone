import {
  AppearanceService,
  type AppearanceStore,
  type OrganizationAppearance,
} from "@workspace/appearance"

import { identity } from "@/lib/identity"

/**
 * Organization appearance for the messages shell.
 *
 * Appearance lives in organization metadata, which the identity database owns.
 * This app reads it through Copilot's internal API; only Copilot writes it.
 */
const store: AppearanceStore = {
  async findMetadata(organizationId) {
    return identity.getAppearance(organizationId)
  },
  async updateMetadata() {
    throw new Error("Organization appearance is managed in Copilot.")
  },
}

const appearanceService = new AppearanceService(store)

export function getOrganizationAppearance(
  organizationId: string
): Promise<OrganizationAppearance> {
  return appearanceService.read(organizationId)
}
