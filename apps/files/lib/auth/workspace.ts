import { redirect } from "next/navigation"

import { resolveWorkspace } from "@workspace/app-shell/resolve-workspace"
import { appUrl } from "@workspace/contracts/server"
import type { MemberRole } from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import type { Entitlements } from "@workspace/organization/entitlements"
import { parseRoles } from "@workspace/organization/roles"
import type { OidcSessionRecord } from "@workspace/oidc"

import {
  resolveTokenOrganization,
  twoFactorEnrollmentRequired,
} from "@/lib/auth/routing"
import { readSessionRecord } from "@/lib/auth/session"
import { env } from "@/lib/env"
import { sessionStore } from "@/lib/oidc"
import {
  getOrganizationShell,
  isPortalMember,
  listUserOrganizations,
} from "@/lib/organization"
import { prisma } from "@/lib/prisma"

/** Everything the files shell and its server actions need per request. */
export interface FilesWorkspace {
  /** The app-local OIDC session (host-only cookie). */
  session: OidcSessionRecord
  user: { id: string; name: string; email: string; image: string | null }
  organization: { id: string; name: string; slug: string }
  role: MemberRole
  /** Copilot session metadata: impersonation expiry and the banner. */
  impersonatedBy: string | null
  entitlements: Entitlements
  /** Per-organization quota override, or the plan's storage limit. */
  storageQuotaBytes: number
  deletionScheduledAt: Date | null
}

const IMPERSONATION_TTL_MS = 60 * 60 * 1000

/**
 * Resolve the signed-in workspace for a `/{locale}/{orgSlug}` route.
 *
 * The shared resolver owns the contract (signed-out, no organization, portal
 * accounts, impersonation TTL); this module adds the relying-party rules:
 *
 * - the local session must still map to a Copilot sign-in;
 * - the token's organization must be the route's organization;
 * - the organization's 2FA policy is enforced on the page as well as at the
 *   authorization endpoint.
 *
 * Anything else redirects, so no screen renders without a valid workspace.
 */
export async function requireFilesWorkspace({
  locale,
  orgSlug,
  returnTo,
}: {
  locale: string
  orgSlug: string
  /** Where to come back after signing in (a same-site path). */
  returnTo: string
}): Promise<FilesWorkspace> {
  const session = await readSessionRecord()

  const [user, copilotSession, memberships] = session
    ? await Promise.all([
        prisma.user.findUnique({
          where: { id: session.userId },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            customerTwoFactorEnabled: true,
          },
        }),
        prisma.session.findUnique({
          where: { id: session.sid },
          select: { impersonatedBy: true, createdAt: true },
        }),
        listUserOrganizations(session.userId),
      ])
    : [null, null, []]

  const organizations = memberships.map(({ organization }) => organization)

  const resolution = await resolveWorkspace({
    getSession: async () =>
      session && user && copilotSession
        ? {
            user: {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              twoFactorEnabled: Boolean(user.customerTwoFactorEnabled),
            },
            session: {
              id: session.id,
              activeOrganizationId: session.organizationId,
              impersonatedBy: copilotSession.impersonatedBy,
              createdAt: copilotSession.createdAt,
            },
          }
        : null,
    listOrganizations: async () => organizations,
    isPortalMember,
    endExpiredImpersonation: async () => {
      // An impersonation that outlived its TTL ends the local session too.
      if (session) await sessionStore.deleteBySid(session.sid)
    },
    orgSlug,
    impersonationTtlMs: IMPERSONATION_TTL_MS,
    signInPath: `/${locale}/sign-in`,
    onboardingPath: appUrl("copilot", { locale, path: "/onboarding" }),
    portalPath: appUrl("copilot", { locale, path: "/portal" }),
    organizationPath: (slug) => `/${locale}/${slug}`,
  })

  if (resolution.kind === "redirect") redirect(resolution.to)

  if (!session || !user) {
    // The resolver already redirects; this keeps the types honest.
    redirect(`/${locale}/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  }

  // The access token is bound to one organization. Never serve another
  // organization's data with it: send the user back to the organization the
  // session was issued for (or re-authorize when that membership is gone).
  const tokenOrganization = resolveTokenOrganization({
    tokenOrganizationId: session.organizationId,
    routeOrganizationId: resolution.organization.id,
    organizations,
    signInPath: `/${locale}/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
    locale,
  })
  if (tokenOrganization.kind === "sign-out") {
    await sessionStore.deleteBySid(session.sid)
    redirect(tokenOrganization.signInPath)
  }
  if (tokenOrganization.kind === "redirect") redirect(tokenOrganization.to)

  const member = await prisma.member.findFirst({
    where: {
      organizationId: resolution.organization.id,
      userId: session.userId,
    },
    select: { role: true },
  })
  if (!member)
    redirect(`/${locale}/sign-in?returnTo=${encodeURIComponent(returnTo)}`)

  const shell = await getOrganizationShell(resolution.organization.id)
  if (!shell) redirect(appUrl("copilot", { locale, path: "/onboarding" }))

  const impersonatedBy = resolution.session.session.impersonatedBy ?? null
  if (
    twoFactorEnrollmentRequired({
      required: shell.requireTwoFactor,
      entitled: shell.entitlements.requireTwoFactor,
      enrolled: Boolean(user.customerTwoFactorEnabled),
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
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    },
    organization: {
      id: resolution.organization.id,
      slug: resolution.organization.slug,
      name: resolution.organization.name ?? resolution.organization.slug,
    },
    role: (parseRoles(member.role)[0] ?? "member") as MemberRole,
    impersonatedBy,
    entitlements: shell.entitlements,
    storageQuotaBytes: shell.storageQuotaBytes,
    deletionScheduledAt: shell.deletionScheduledAt,
  }
}

/** The actor context the files services authorize against. */
export function toRequestContext(workspace: FilesWorkspace): RequestContext {
  return {
    userId: workspace.user.id,
    userName: workspace.user.name,
    userEmail: workspace.user.email,
    organizationId: workspace.organization.id,
    role: workspace.role,
  }
}
