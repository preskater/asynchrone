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
import { FilesShellProvider } from "@/components/files-provider"
import { SiteHeader } from "@/components/site-header"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getOrganizationAppearance } from "@/lib/appearance/service"
import { AssistantProvider } from "@workspace/ai/use-assistant"
import { CalendarsProvider } from "@/lib/calendars/store"
import type { CalendarData } from "@workspace/calendars/types"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import type { FilesData } from "@workspace/files/types"
import { notificationService } from "@/lib/notifications"
import { mustEnrollTwoFactor } from "@/lib/organization/two-factor-policy"
import { getOrganizationShell } from "@/lib/organization/shell"
import { getTrialStatus } from "@/lib/organization/trial-service"
import { EntitlementsProvider } from "@/lib/organization/use-entitlements"
import { isPortalMember } from "@/lib/portal/context"
import { WorkspaceNavProvider } from "@/lib/workspace-nav/store"
import { toMemberDirectoryEntry } from "@workspace/organization/directory"
import { appOrigin } from "@workspace/contracts/server"

/** Domain screens hydrate their own data; the shell starts empty. */
const EMPTY_CALENDAR_DATA: CalendarData = { calendars: [], events: [] }
const EMPTY_FILES_DATA: FilesData = {
  files: [],
  shares: {},
  versions: {},
  activities: {},
}

/**
 * The Copilot workspace shell.
 *
 * The project screens moved to `apps/projects` (#160) and the messaging
 * screens to `apps/messages` (#162): this shell renders neither. The member
 * directory comes from the identity database Copilot owns and feeds the files
 * and calendar providers.
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
  const projectsUrl = appOrigin("projects")
  const messagesUrl = appOrigin("messages")

  const [notificationData, appearance, trial, shell, memberRows] =
    await Promise.all([
      notificationService.list(ctx),
      getOrganizationAppearance(organization.id),
      getTrialStatus(organization.id),
      getOrganizationShell(organization.id),
      prisma.member.findMany({
        where: { organizationId: organization.id, clientId: null },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      }),
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

  // Organization members never carry the client role; the directory type keeps
  // it for portal rows, so normalize it for the workspace providers.
  const members = memberRows.map(toMemberDirectoryEntry).map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    avatarUrl: member.avatarUrl,
    role: (member.role === "client" ? "member" : member.role) as
      "owner" | "admin" | "member" | "viewer",
  }))

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={entitlements}>
        <AppearanceProvider initialAppearance={appearance} userId={ctx.userId}>
          <RecentsProvider organizationId={organization.id}>
            <CalendarsProvider
              initialData={EMPTY_CALENDAR_DATA}
              currentUserId={ctx.userId}
              members={members}
            >
              <WorkspaceNavProvider>
                <FilesShellProvider
                  initialData={EMPTY_FILES_DATA}
                  currentUserId={ctx.userId}
                  organizationId={organization.id}
                  storageQuotaBytes={storageQuotaBytes}
                  members={members}
                >
                  <AssistantProvider organizationId={organization.id}>
                    <WorkspaceShell
                      skipLabel={t("skipToContent")}
                      sidebar={
                        <AppSidebar
                          variant="inset"
                          orgSlug={organization.slug}
                          projectsUrl={projectsUrl}
                          messagesUrl={messagesUrl}
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
                          projectsUrl={projectsUrl}
                          messagesUrl={messagesUrl}
                          user={session.user}
                          activeOrganizationId={organization.id}
                          notifications={notificationData}
                        />
                      }
                    >
                      {children}
                    </WorkspaceShell>
                  </AssistantProvider>
                </FilesShellProvider>
              </WorkspaceNavProvider>
            </CalendarsProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
