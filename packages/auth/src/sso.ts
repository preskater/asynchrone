/**
 * Organization SSO policy (#93, ADR 0044).
 *
 * The Better Auth `sso` plugin owns provider records, the OIDC/SAML flows and
 * DNS domain verification. This module adds what the plugin leaves to the
 * application: which management endpoints stay server-only, and whether a user
 * must sign in through their organization's identity provider.
 */

/**
 * Provider management endpoints. They are called only from Copilot's server
 * actions (entitlement, capability and audit checks); a direct HTTP call to
 * `/api/auth/sso/*` is refused.
 */
export const SSO_MANAGEMENT_PATHS: ReadonlySet<string> = new Set([
  "/sso/register",
  "/sso/update-provider",
  "/sso/delete-provider",
  "/sso/get-provider",
  "/sso/providers",
  "/sso/request-domain-verification",
  "/sso/verify-domain",
])

/** A session created by the SSO callbacks (OIDC or SAML). */
export function isSsoSessionPath(path: string | undefined): boolean {
  return path?.startsWith("/sso/") ?? false
}

/**
 * The email's domain and each parent domain, matching the plugin's rule that
 * a provider for `example.com` also covers `eu.example.com`.
 */
export function ssoDomainCandidates(email: string): string[] {
  const domain = email.split("@")[1]?.trim().toLowerCase()
  if (!domain) return []
  const labels = domain.split(".")
  return labels.slice(0, -1).map((_, index) => labels.slice(index).join("."))
}

export interface SsoPolicyOrganization {
  metadata: string | null
  trialEndsAt: Date | null
  subscription: { plan: string } | null
}

export interface SsoPolicyDb {
  user: {
    findUnique(args: {
      where: { id: string }
      select: { email: true }
    }): Promise<{ email: string } | null>
  }
  ssoProvider: {
    findFirst(args: unknown): Promise<{
      organizationId: string | null
      organization: SsoPolicyOrganization | null
    } | null>
  }
  member: {
    findFirst(args: {
      where: { organizationId: string; userId: string }
      select: { role: true }
    }): Promise<{ role: string } | null>
  }
}

export interface SsoPolicyOrg {
  resolvePlan: (source: SsoPolicyOrganization) => unknown
  entitlementsFor: (plan: any) => { sso: boolean }
  parseRoles: (role: string | null | undefined) => string[]
}

/**
 * Whether this user must sign in through SSO: their email is on a verified
 * domain of an organization that enforces SSO and is still entitled to it.
 * Owners of that organization keep password + 2FA as break-glass, so a broken
 * identity provider cannot lock everyone out.
 */
export async function requiresSso(
  db: SsoPolicyDb,
  org: SsoPolicyOrg,
  userId: string
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  const domains = user ? ssoDomainCandidates(user.email) : []
  if (domains.length === 0) return false

  const provider = await db.ssoProvider.findFirst({
    where: {
      domain: { in: domains },
      domainVerified: true,
      organization: { ssoEnforced: true },
    },
    select: {
      organizationId: true,
      organization: {
        select: {
          metadata: true,
          trialEndsAt: true,
          subscription: { select: { plan: true } },
        },
      },
    },
  })
  if (!provider?.organizationId || !provider.organization) return false
  if (!org.entitlementsFor(org.resolvePlan(provider.organization)).sso) {
    return false
  }

  const member = await db.member.findFirst({
    where: { organizationId: provider.organizationId, userId },
    select: { role: true },
  })
  return !(member && org.parseRoles(member.role).includes("owner"))
}
