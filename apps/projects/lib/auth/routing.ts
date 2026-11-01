/**
 * Pure rules the workspace resolver applies on top of `@workspace/app-shell`.
 *
 * Kept dependency-free so they can be unit-tested without a database, a
 * session or a running server.
 */

export interface OrganizationChoice {
  id: string
  name: string
  slug: string
}

/**
 * The workspace 2FA gate. A stored policy only applies while the plan includes
 * it, so a downgrade lifts it without rewriting the setting. Impersonating
 * staff cannot enroll on the user's behalf, so they are let through.
 */
export function twoFactorEnrollmentRequired({
  required,
  entitled,
  enrolled,
  impersonated,
}: {
  required: boolean
  entitled: boolean
  enrolled: boolean
  impersonated: boolean
}): boolean {
  return required && entitled && !enrolled && !impersonated
}

export type TokenOrganizationResolution =
  /** The route's organization is the organization the token was issued for. */
  | { kind: "ok" }
  /** Serve the organization the token belongs to instead of the route's one. */
  | { kind: "redirect"; to: string }
  /** The session's membership is gone: clear it and sign in again. */
  | { kind: "sign-out"; signInPath: string }

/**
 * An access token is bound to one organization.
 *
 * A domain app must never serve another organization's data with it, even when
 * the user is a member there: such a visit means the user has to re-authorize
 * (organization switch) or is following a stale link.
 */
export function resolveTokenOrganization({
  tokenOrganizationId,
  routeOrganizationId,
  organizations,
  signInPath,
  locale,
}: {
  tokenOrganizationId: string
  routeOrganizationId: string
  organizations: readonly OrganizationChoice[]
  signInPath: string
  locale: string
}): TokenOrganizationResolution {
  if (tokenOrganizationId === routeOrganizationId) return { kind: "ok" }

  const issuedFor = organizations.find(
    (organization) => organization.id === tokenOrganizationId
  )
  if (!issuedFor) return { kind: "sign-out", signInPath }
  return { kind: "redirect", to: `/${locale}/${issuedFor.slug}` }
}
