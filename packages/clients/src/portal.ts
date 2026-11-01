/**
 * Portal-access shapes shown on the client company detail page.
 *
 * These mirror `PortalAccessData` from Copilot's portal domain: the clients
 * domain only renders the list and calls the injected portal actions, so it
 * keeps a structural copy instead of importing the portal module.
 */

/** A portal user of a company (internal view). */
export interface PortalMemberData {
  memberId: string
  userId: string
  name: string
  email: string
  createdAt: string
}

/** A pending portal invitation of a company (internal view). */
export interface PortalInviteData {
  id: string
  email: string
  name?: string
  createdAt: string
  invitationId?: string
}

export interface PortalAccessData {
  members: PortalMemberData[]
  invites: PortalInviteData[]
}
