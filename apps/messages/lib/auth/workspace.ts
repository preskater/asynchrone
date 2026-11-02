import { redirect } from "next/navigation"

import { resolveWorkspace } from "@workspace/app-shell/resolve-workspace"
import { appUrl } from "@workspace/contracts/server"
import { IdentityClientError, type MemberRole } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import type { Entitlements } from "@workspace/organization/entitlements"
import { IMPERSONATION_TTL_MS, twoFactorRequiredByClaims } from "@workspace/oidc"

import {
  resolveTokenOrganization,
  twoFactorEnrollmentRequired,
} from "@/lib/auth/routing"
import { readSessionRecord } from "@/lib/auth/session"
import { env } from "@/lib/env"
import { readWorkspace } from "@/lib/identity"
import { sessionStore } from "@/lib/oidc"

/** Everything the messages shell and its server actions need per request. */
export interface MessagesWorkspace {
  /** The app-local OIDC session (host-only cookie). */
  session: NonNullable<Awaited<ReturnType<typeof readSessionRecord>>>
  user: { id: string; name: string; email: string; image: string | null }
  organization: { id: string; name: string; slug: string }
  role: MemberRole
  /** Copilot session metadata: impersonation expiry and the banner. */
  impersonatedBy: string | null
  entitlements: Entitlements
  storageQuotaBytes: number
  deletionScheduledAt: Date | null
  /** Every organization the user can switch to. */
  organizations: { id: string; name: string; slug: string }[]
}

/**
 * Resolve the signed-in workspace for a `/{locale}/{orgSlug}` route.
 *
 * The shared resolver owns the contract (signed-out, no organization, portal
 * accounts, impersonation TTL); this module adds the relying-party rules:
 *
 * - the local session must still map to a live Copilot sign-in;
 * - the token's organization must be the route's organization;
 * - the organization's 2FA policy is enforced on the page as well as at the
 *   authorization endpoint.
 *
 * Identity data comes from Copilot's workspace API; this app owns no identity
 * table and never reads the identity database.
 */
export async function requireMessagesWorkspace({
  locale,
  orgSlug,
  returnTo,
}: {
  locale: string
  orgSlug: string
  /** Where to come back after signing in (a same-site path). */
  returnTo: string
}): Promise<MessagesWorkspace> {
  const session = await readSessionRecord()
  const signInPath = `/${locale}/sign-in?returnTo=${encodeURIComponent(returnTo)}`
  if (!session) redirect(signInPath)

  let workspace
  try {
    workspace = await readWorkspace(session.sid, session.organizationId)
  } catch (cause) {
    if (cause instanceof IdentityClientError && cause.status === 404) {
      await sessionStore.deleteBySid(session.sid)
      redirect(signInPath)
    }
    throw cause
  }
  if (!workspace) {
    await sessionStore.deleteBySid(session.sid)
    redirect(signInPath)
  }

  const organizations = workspace.organizations.map(({ id, name, slug }) => ({
    id,
    name,
    slug,
  }))

  const resolution = await resolveWorkspace({
    getSession: async () => ({
      user: {
        id: workspace.user.id,
        name: workspace.user.name,
        email: workspace.user.email,
        image: workspace.user.image,
        twoFactorEnabled: workspace.user.twoFactorEnabled,
      },
      session: {
        id: workspace.session.id,
        activeOrganizationId: session.organizationId,
        impersonatedBy: workspace.session.impersonatedBy,
        createdAt: workspace.session.createdAt,
      },
    }),
    listOrganizations: async () => organizations,
    isPortalMember: async (organizationId, userId) =>
      organizationId === workspace.organization.id &&
      userId === workspace.user.id &&
      workspace.member.clientId != null,
    endExpiredImpersonation: async () => {
      // An impersonation that outlived its TTL ends the local session too.
      await sessionStore.deleteBySid(session.sid)
    },
    orgSlug,
    impersonationTtlMs: IMPERSONATION_TTL_MS,
    signInPath: `/${locale}/sign-in`,
    onboardingPath: appUrl("copilot", { locale, path: "/onboarding" }),
    portalPath: appUrl("copilot", { locale, path: "/portal" }),
    organizationPath: (slug) => `/${locale}/${slug}`,
  })

  if (resolution.kind === "redirect") redirect(resolution.to)

  // The access token is bound to one organization. Never serve another
  // organization's data with it: send the user back to the organization the
  // session was issued for (or re-authorize when that membership is gone).
  const tokenOrganization = resolveTokenOrganization({
    tokenOrganizationId: session.organizationId,
    routeOrganizationId: resolution.organization.id,
    organizations,
    signInPath,
    locale,
  })
  if (tokenOrganization.kind === "sign-out") {
    await sessionStore.deleteBySid(session.sid)
    redirect(tokenOrganization.signInPath)
  }
  if (tokenOrganization.kind === "redirect") redirect(tokenOrganization.to)

  const impersonatedBy = workspace.session.impersonatedBy ?? null
  if (
    twoFactorEnrollmentRequired({
      // The current policy wins, but a token captured under an older policy
      // cannot lower the requirement: both must be satisfied.
      required:
        workspace.requireTwoFactor ||
        twoFactorRequiredByClaims(session.claims),
      entitled: workspace.entitlements.requireTwoFactor,
      enrolled: workspace.user.twoFactorEnabled,
      impersonated: Boolean(impersonatedBy),
    })
  ) {
    // The setup page resumes on Copilot; signing in here again re-runs the
    // authorization gate once the member is enrolled.
    redirect(
      `${env.COPILOT_APP_URL}/${locale}/two-factor/setup?next=${encodeURIComponent(
        `/${locale}/${resolution.organization.slug}`
      )}`
    )
  }

  return {
    session,
    user: {
      id: workspace.user.id,
      name: workspace.user.name,
      email: workspace.user.email,
      image: workspace.user.image ?? null,
    },
    organization: {
      id: workspace.organization.id,
      slug: workspace.organization.slug,
      name: workspace.organization.name,
    },
    role: workspace.member.role,
    impersonatedBy,
    entitlements: workspace.entitlements as unknown as Entitlements,
    storageQuotaBytes: workspace.storageQuotaBytes,
    deletionScheduledAt: workspace.deletionScheduledAt,
    organizations,
  }
}

/** The actor context the messages services authorize against. */
export function toRequestContext(workspace: MessagesWorkspace): RequestContext {
  return {
    userId: workspace.user.id,
    userName: workspace.user.name,
    userEmail: workspace.user.email,
    organizationId: workspace.organization.id,
    role: workspace.role,
  }
}
