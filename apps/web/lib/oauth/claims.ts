import type { OrgPlan } from "@workspace/db/plans"

import { parseRoles } from "@workspace/organization/utils"

/**
 * Pure claim construction for the OAuth provider. Keeping this out of
 * `auth.ts` makes the token shape testable without booting Better Auth.
 */

export interface OAuthClaimUser {
  id: string
  name: string
  email: string
  twoFactorEnabled?: boolean | null
}

export interface OAuthClaimOrganization {
  id: string
  name: string
  slug: string
  requireTwoFactor: boolean
}

export interface OAuthClaimMember {
  role: string
}

export interface OAuthClaimInput {
  user: OAuthClaimUser
  organization: OAuthClaimOrganization
  member: OAuthClaimMember | null
  plan: OrgPlan
  requireTwoFactorEntitled: boolean
}

export interface OAuthClaims {
  organizationId: string
  org: string
  org_slug: string
  organizationName: string
  role: string
  plan: OrgPlan
  userName: string
  userEmail: string
  twoFactorRequired: boolean
  twoFactorEnrolled: boolean
}

export function buildOAuthClaims({
  user,
  organization,
  member,
  plan,
  requireTwoFactorEntitled,
}: OAuthClaimInput): OAuthClaims {
  return {
    organizationId: organization.id,
    org: organization.id,
    org_slug: organization.slug,
    organizationName: organization.name,
    role: parseRoles(member?.role)[0] ?? "member",
    plan,
    userName: user.name,
    userEmail: user.email,
    twoFactorRequired:
      organization.requireTwoFactor && requireTwoFactorEntitled,
    twoFactorEnrolled: Boolean(user.twoFactorEnabled),
  }
}

/**
 * The workspace gate and the OAuth authorization hook share this predicate.
 * Impersonating staff cannot enroll on the user's behalf, so they are exempt.
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
