import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError, NotFoundError } from "@workspace/core/errors"
import { can } from "@workspace/organization/roles"

import {
  parseOrganizationAppearance,
  parseOrganizationMetadata,
  type OrganizationAppearance,
} from "./types"

/**
 * Appearance preferences are identity-scoped: they live on the organization's
 * metadata in the identity database. The package only knows the storage port,
 * so a domain app can read the same preferences through Copilot's internal API
 * without opening another database connection.
 */
export interface AppearanceStore {
  findMetadata(
    organizationId: string
  ): Promise<{ metadata: string | null } | null>
  updateMetadata(organizationId: string, metadata: string): Promise<void>
}

export class AppearanceService {
  constructor(private readonly store: AppearanceStore) {}

  /** Reads the effective appearance for an organization. */
  async read(organizationId: string): Promise<OrganizationAppearance> {
    const organization = await this.store.findMetadata(organizationId)
    return parseOrganizationAppearance(organization?.metadata ?? null)
  }

  /**
   * Persists the appearance for the caller's active organization. Only owners
   * and admins may change it; other metadata keys (e.g. `plan`) are preserved.
   */
  async update(
    ctx: RequestContext,
    appearance: OrganizationAppearance
  ): Promise<OrganizationAppearance> {
    if (!can(ctx, "appearance:update")) {
      throw new ForbiddenError(
        "Only owners and admins can change the organization appearance."
      )
    }

    const organization = await this.store.findMetadata(ctx.organizationId)
    if (!organization) throw new NotFoundError("Organization")

    const metadata = parseOrganizationMetadata(organization.metadata)
    metadata.appearance = appearance

    await this.store.updateMetadata(
      ctx.organizationId,
      JSON.stringify(metadata)
    )

    return appearance
  }
}
