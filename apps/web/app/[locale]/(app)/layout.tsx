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
import { AssistantProvider } from "@workspace/ai/use-assistant"
import { CalendarsProvider } from "@/lib/calendars/store"
import type { CalendarData } from "@/lib/calendars/types"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import { FilesProvider } from "@/lib/files/store"
import type { FilesData } from "@/lib/files/types"
import { MessagingProvider } from "@/lib/messaging/store"
import type { MessagingData } from "@/lib/messaging/types"
import { notificationService } from "@/lib/notifications"
import { mustEnrollTwoFactor } from "@/lib/organization/two-factor-policy"
import { getOrganizationShell } from "@/lib/organization/shell"
import { getTrialStatus } from "@/lib/organization/trial-service"
import { EntitlementsProvider } from "@/lib/organization/use-entitlements"
import { isPortalMember } from "@/lib/portal/context"
import { ProjectStoreProvider } from "@/lib/projects/store"
import type { ProjectData } from "@/lib/projects/types"
import { WorkspaceNavProvider } from "@/lib/workspace-nav/store"

/** Domain screens hydrate their own data; the shell starts empty. */
const EMPTY_PROJECT_DATA: ProjectData = {
  projects: [],
  tasks: [],
  members: [],
  labels: [],
  templates: [],
  activities: [],
}
const EMPTY_CALENDAR_DATA: CalendarData = { calendars: [], events: [] }
const EMPTY_MESSAGING_DATA: MessagingData = {
  teams: [],
  conversations: [],
  messages: [],
  presence: {},
  typing: {},
}
const EMPTY_FILES_DATA: FilesData = {
  files: [],
  shares: {},
  versions: {},
  activities: {},
}

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

  const [notificationData, appearance, trial, shell] = await Promise.all([
    notificationService.list(ctx),
    getOrganizationAppearance(organization.id),
    getTrialStatus(organization.id),
    getOrganizationShell(organization.id),
  ])
  if (!shell) redirect("/onboarding")

  const { entitlements, storageQuotaBytes, deletionScheduledAt } = shell
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
            <ProjectStoreProvider
              initialData={EMPTY_PROJECT_DATA}
              currentUserId={ctx.userId}
            >
              <MessagingProvider
                initialData={EMPTY_MESSAGING_DATA}
                currentUserId={ctx.userId}
                organizationId={organization.id}
              >
                <CalendarsProvider
                  initialData={EMPTY_CALENDAR_DATA}
                  currentUserId={ctx.userId}
                >
                  <FilesProvider
                    initialData={EMPTY_FILES_DATA}
                    currentUserId={ctx.userId}
                    organizationId={organization.id}
                    storageQuotaBytes={storageQuotaBytes}
                  >
                    <WorkspaceNavProvider>
                      <AssistantProvider>
                        <WorkspaceShell
                          skipLabel={t("skipToContent")}
                          sidebar={
                            <AppSidebar
                              variant="inset"
                              orgSlug={organization.slug}
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
                              user={session.user}
                              activeOrganizationId={organization.id}
                              notifications={notificationData}
                            />
                          }
                        >
                          {children}
                        </WorkspaceShell>
                      </AssistantProvider>
                    </WorkspaceNavProvider>
                  </FilesProvider>
                </CalendarsProvider>
              </MessagingProvider>
            </ProjectStoreProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
