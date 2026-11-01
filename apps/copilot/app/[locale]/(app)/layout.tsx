import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import { DeletionBanner } from "@workspace/app-shell/deletion-banner"
import { ImpersonationBanner } from "@workspace/app-shell/impersonation-banner"
import { RecentsProvider } from "@workspace/app-shell/recents"
import { resolveWorkspace } from "@workspace/app-shell/resolve-workspace"
import { WorkspaceShell } from "@workspace/app-shell/shell"
import { TrialBanner } from "@workspace/app-shell/trial-banner"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationAppearance } from "@/lib/appearance/service"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import { notificationService } from "@/lib/notifications"
import { mustEnrollTwoFactor } from "@/lib/organization/two-factor-policy"
import { getOrganizationShell } from "@/lib/organization/shell"
import { getTrialStatus } from "@/lib/organization/trial-service"
import { EntitlementsProvider } from "@/lib/organization/use-entitlements"
import { isPortalMember } from "@/lib/portal/context"
import { appOrigin } from "@workspace/contracts/server"

/**
 * The Copilot workspace shell.
 *
 * The project screens moved to `apps/projects` (#160), calendars/meetings and
 * files to `apps/calendars` and `apps/files` (#161) and messaging to
 * `apps/messages` (#162). This shell renders the assistant, clients and
 * employees — it mounts no project, calendar, files or messaging provider.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const workspace = await resolveWorkspace({
    getSession: async () => auth.api.getSession({ headers: await headers() }),
    listOrganizations: async () =>
      auth.api.listOrganizations({ headers: await headers() }),
    isPortalMember,
    endExpiredImpersonation: async (sessionId) => {
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {})
    },
  })

  if (workspace.kind === "redirect") redirect(workspace.to)

  const { session, organization } = workspace
  const ctx = await getRequestContextForOrganization(organization.id)
  const t = await getTranslations("Common")
  const domainApps = {
    projects: appOrigin("projects"),
    messages: appOrigin("messages"),
    calendars: appOrigin("calendars"),
    files: appOrigin("files"),
  }

  const [notificationData, appearance, trial, shell] = await Promise.all([
    notificationService.list(ctx),
    getOrganizationAppearance(organization.id),
    getTrialStatus(organization.id),
    getOrganizationShell(organization.id),
  ])
  if (!shell) redirect("/onboarding")

  const { entitlements, deletionScheduledAt } = shell
  if (
    mustEnrollTwoFactor({
      required: shell.requireTwoFactor,
      entitled: entitlements.requireTwoFactor,
      enrolled: Boolean(session.user.twoFactorEnabled),
      impersonated: Boolean(session.session.impersonatedBy),
    })
  ) {
    redirect("/two-factor/setup")
  }

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={entitlements}>
        <AppearanceProvider initialAppearance={appearance} userId={ctx.userId}>
          <RecentsProvider organizationId={organization.id}>
            <WorkspaceShell
              skipLabel={t("skipToContent")}
              sidebar={
                <AppSidebar
                  variant="inset"
                  orgSlug={organization.slug}
                  domainApps={domainApps}
                />
              }
              banners={
                <>
                  {session.session.impersonatedBy ? (
                    <ImpersonationBanner name={session.user.name} />
                  ) : null}
                  {deletionScheduledAt ? (
                    <DeletionBanner
                      scheduledAt={deletionScheduledAt}
                      orgSlug={organization.slug}
                    />
                  ) : null}
                  {trial?.state === "active" ? (
                    <TrialBanner daysLeft={trial.daysLeft} />
                  ) : null}
                </>
              }
              header={
                <SiteHeader
                  orgSlug={organization.slug}
                  domainApps={domainApps}
                  user={session.user}
                  activeOrganizationId={organization.id}
                  notifications={notificationData}
                />
              }
            >
              {children}
            </WorkspaceShell>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
