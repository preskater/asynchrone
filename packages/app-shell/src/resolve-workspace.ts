export interface WorkspaceUser {
  id: string
  name: string
  email: string
  image?: string | null
  twoFactorEnabled?: boolean | null
}

export interface WorkspaceSession {
  user: WorkspaceUser
  session: {
    id: string
    activeOrganizationId?: string | null
    impersonatedBy?: string | null
    createdAt: Date | string
  }
}

export interface WorkspaceOrganization {
  id: string
  slug: string
  name?: string
}

export interface ResolveWorkspaceOptions {
  getSession: () => Promise<WorkspaceSession | null>
  listOrganizations: (
    session: WorkspaceSession
  ) => Promise<WorkspaceOrganization[]>
  isPortalMember: (organizationId: string, userId: string) => Promise<boolean>
  /** Delete the session when an impersonation outlives its TTL. */
  endExpiredImpersonation?: (sessionId: string) => Promise<void>
  /** Organization slug from the route, when there is one. */
  orgSlug?: string
  impersonationTtlMs?: number
  signInPath?: string
  onboardingPath?: string
  portalPath?: string
  organizationPath?: (slug: string) => string
}

export type WorkspaceResolution =
  | {
      kind: "ok"
      session: WorkspaceSession
      organization: WorkspaceOrganization
      /** The active organization differs from the route's organization. */
      needsSync: boolean
    }
  | {
      kind: "redirect"
      to: string
      reason:
        | "signed-out"
        | "impersonation-expired"
        | "no-organization"
        | "unknown-organization"
        | "portal"
    }

const DEFAULT_IMPERSONATION_TTL_MS = 60 * 60 * 1000

/**
 * Resolve the shared workspace contract from an app-local session.
 *
 * Copilot passes its Better Auth session; a domain app passes its OIDC session
 * reader. The resolver never reads a shared cookie and never renders a route.
 */
export async function resolveWorkspace({
  getSession,
  listOrganizations,
  isPortalMember,
  endExpiredImpersonation,
  orgSlug,
  impersonationTtlMs = DEFAULT_IMPERSONATION_TTL_MS,
  signInPath = "/sign-in",
  onboardingPath = "/onboarding",
  portalPath = "/portal",
  organizationPath = (slug) => `/${slug}`,
}: ResolveWorkspaceOptions): Promise<WorkspaceResolution> {
  const session = await getSession()
  if (!session)
    return { kind: "redirect", to: signInPath, reason: "signed-out" }

  // Impersonation is time-boxed even if the auth server refreshes the session.
  if (
    session.session.impersonatedBy &&
    Date.now() - new Date(session.session.createdAt).getTime() >
      impersonationTtlMs
  ) {
    await endExpiredImpersonation?.(session.session.id)
    return {
      kind: "redirect",
      to: `${signInPath}?error=impersonation-expired`,
      reason: "impersonation-expired",
    }
  }

  const organizations = await listOrganizations(session)
  if (organizations.length === 0) {
    return {
      kind: "redirect",
      to: onboardingPath,
      reason: "no-organization",
    }
  }

  const organization = orgSlug
    ? organizations.find((org) => org.slug === orgSlug)
    : (organizations.find(
        (org) => org.id === session.session.activeOrganizationId
      ) ?? organizations[0])

  if (!organization) {
    return {
      kind: "redirect",
      to: organizationPath(organizations[0]!.slug),
      reason: "unknown-organization",
    }
  }

  // Client-portal members never reach the internal workspace.
  if (await isPortalMember(organization.id, session.user.id)) {
    return { kind: "redirect", to: portalPath, reason: "portal" }
  }

  return {
    kind: "ok",
    session,
    organization,
    needsSync: session.session.activeOrganizationId !== organization.id,
  }
}
