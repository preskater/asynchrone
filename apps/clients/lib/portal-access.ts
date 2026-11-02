import type { PortalAccessData } from "@workspace/clients/portal"

import { identity } from "@/lib/identity"

/**
 * Portal users and pending invitations of one client company.
 *
 * Copilot owns the Better Auth invitations and the portal members, so this app
 * asks its identity API instead of reading the identity database. The card is
 * read-only here; invites and revocations stay in Copilot.
 */
export async function getPortalAccess(
  organizationId: string,
  clientId: string
): Promise<PortalAccessData> {
  return identity.getPortalAccess(organizationId, clientId)
}
