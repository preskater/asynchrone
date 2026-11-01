import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { AppSidebar } from "@/components/app-sidebar"
import { AppearanceProvider } from "@/components/appearance/appearance-provider"
import { ImpersonationBanner } from "@/components/impersonation-banner"
import { SiteHeader } from "@/components/site-header"
import { TrialBanner } from "@/components/trial/trial-banner"
import { DeletionBanner } from "@/components/organization/deletion-banner"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { IMPERSONATION_TTL_MS } from "@workspace/auth/impersonation"
import { getOrganizationAppearance } from "@/lib/appearance/service"
import { AssistantProvider } from "@/lib/assistant/use-assistant"
import { calendarService } from "@/lib/calendars"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import type { FilesData } from "@/lib/files/types"
import { messagingService } from "@/lib/messaging"
import { notificationService } from "@/lib/notifications"
import { getTrialStatus } from "@/lib/organization/trial-service"
import { getOrganizationShell } from "@/lib/organization/shell"
import { mustEnrollTwoFactor } from "@/lib/organization/two-factor-policy"
import { EntitlementsProvider } from "@/lib/organization/use-entitlements"
import { isPortalMember } from "@/lib/portal/context"
import { projectService } from "@/lib/projects"
import { CalendarsProvider } from "@/lib/calendars/store"
import { FilesProvider } from "@/lib/files/store"
import { MessagingProvider } from "@/lib/messaging/store"
import { ProjectStoreProvider } from "@/lib/projects/store"
import { RecentsProvider } from "@/lib/recents/store"
import { WorkspaceNavProvider } from "@/lib/workspace-nav/store"

/** Files are hydrated by the files screen, not by the app shell. */
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
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/sign-in")
  }

  // Impersonation is time-boxed even if Better Auth refreshes the session.
  if (
    session.session.impersonatedBy &&
    Date.now() - new Date(session.session.createdAt).getTime() >
      IMPERSONATION_TTL_MS
  ) {
    await prisma.session
      .delete({ where: { id: session.session.id } })
      .catch(() => {})
    redirect("/sign-in?error=impersonation-expired")
  }

  const organizations = await auth.api.listOrganizations({
    headers: await headers(),
  })

  if (organizations.length === 0) {
    redirect("/onboarding")
  }

  const organization =
    organizations.find(
      (org) => org.id === session.session.activeOrganizationId
    ) ?? organizations[0]!

  // Client-portal members never reach the internal workspace.
  if (await isPortalMember(organization.id, session.user.id)) {
    redirect("/portal")
  }

  const ctx = await getRequestContextForOrganization(organization.id)
  const t = await getTranslations("Common")

  const [
    projectData,
    calendarData,
    messagingData,
    notificationData,
    appearance,
    trial,
    // One read of the organization row for the plan, the storage quota and the
    // deletion banner, instead of three lookups on the same row.
    shell,
  ] = await Promise.all([
    // Shell-level only: project metadata, calendar sources and conversation
    // metadata. Tasks, events, files and messages load per feature.
    projectService.listShell(ctx),
    calendarService.listShell(ctx),
    messagingService.list(ctx),
    notificationService.list(ctx),
    getOrganizationAppearance(organization.id),
    getTrialStatus(organization.id),
    getOrganizationShell(organization.id),
  ])
  if (!shell) {
    redirect("/onboarding")
  }
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
  const filesData = EMPTY_FILES_DATA

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={entitlements}>
        <AppearanceProvider initialAppearance={appearance} userId={ctx.userId}>
          <RecentsProvider organizationId={organization.id}>
            <ProjectStoreProvider
              initialData={projectData}
              currentUserId={ctx.userId}
            >
              <MessagingProvider
                initialData={messagingData}
                currentUserId={ctx.userId}
                organizationId={organization.id}
                members={projectData.members}
              >
                <CalendarsProvider
                  initialData={calendarData}
                  currentUserId={ctx.userId}
                  members={projectData.members}
                >
                  <FilesProvider
                    initialData={filesData}
                    currentUserId={ctx.userId}
                    organizationId={organization.id}
                    storageQuotaBytes={storageQuotaBytes}
                    members={projectData.members}
                  >
                    <WorkspaceNavProvider>
                      <AssistantProvider>
                        <SidebarProvider
                          style={
                            {
                              "--sidebar-width": "calc(var(--spacing) * 72)",
                              "--header-height": "calc(var(--spacing) * 12)",
                            } as React.CSSProperties
                          }
                        >
                          <a
                            href="#main-content"
                            className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
                          >
                            {t("skipToContent")}
                          </a>
                          <AppSidebar
                            variant="inset"
                            orgSlug={organization.slug}
                          />
                          <SidebarInset id="main-content">
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
                            <SiteHeader
                              orgSlug={organization.slug}
                              user={session.user}
                              activeOrganizationId={organization.id}
                              notifications={notificationData}
                            />
                            <div className="flex flex-1 flex-col">
                              <div className="@container/main flex flex-1 flex-col gap-2">
                                {children}
                              </div>
                            </div>
                          </SidebarInset>
                        </SidebarProvider>
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
