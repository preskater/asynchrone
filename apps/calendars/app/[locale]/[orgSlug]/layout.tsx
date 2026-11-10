import { getTranslations } from "next-intl/server"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import { DeletionBanner } from "@workspace/app-shell/deletion-banner"
import { ImpersonationBanner } from "@workspace/app-shell/impersonation-banner"
import { RecentsProvider } from "@workspace/app-shell/recents"
import { WorkspaceShell } from "@workspace/app-shell/shell"
import { appOrigin } from "@workspace/contracts/server"
import { EntitlementsProvider } from "@workspace/organization/use-entitlements"
import { toDirectoryEntry } from "@workspace/organization/directory"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { getOrganizationAppearance } from "@/lib/appearance"
import {
  requireCalendarWorkspace,
  toRequestContext,
} from "@/lib/auth/workspace"
import { calendarService } from "@/lib/calendars"
import { CalendarsProvider } from "@/lib/calendars/store"
import { PermissionsProvider } from "@/lib/permissions"
import { identity } from "@/lib/identity"
import { WorkspaceNavProvider } from "@/lib/workspace-nav/store"

/**
 * The workspace shell for the calendars host.
 *
 * Every request resolves the session, the organization and the plan here; the
 * screens below never render without them. Calendar data is loaded in this app
 * (calendar sources here, events on demand from the store) — Copilot no longer
 * mounts a calendar provider.
 */
export default async function OrgLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string; orgSlug: string }>
}>) {
  const { locale, orgSlug } = await params
  const workspace = await requireCalendarWorkspace({
    locale,
    orgSlug,
    returnTo: `/${locale}/${orgSlug}/calendars`,
  })
  const ctx = toRequestContext(workspace)

  const [initialData, appearance, memberRows] = await Promise.all([
    calendarService.listShell(ctx),
    getOrganizationAppearance(workspace.organization.id),
    identity.listMembers(workspace.organization.id),
  ])

  const t = await getTranslations("Common")
  const sidebar = await getTranslations("Sidebar")
  const copilotUrl = appOrigin("copilot")
  const organizations = workspace.organizations
  // Organization members never carry the client role; the directory type keeps
  // it for portal rows, so normalize it for the workspace providers.
  const members = memberRows.map(toDirectoryEntry).map((member) => ({
    id: member.userId,
    name: member.name,
    email: member.email,
    avatarUrl: member.avatarUrl ?? undefined,
    role: (member.role === "client" ? "member" : member.role) as
      "owner" | "admin" | "member" | "viewer",
  }))

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={workspace.entitlements}>
        <AppearanceProvider
          initialAppearance={appearance}
          userId={workspace.user.id}
        >
          <RecentsProvider organizationId={workspace.organization.id}>
            <PermissionsProvider role={workspace.role}>
              <CalendarsProvider
                initialData={initialData}
                currentUserId={workspace.user.id}
                members={members}
              >
                <WorkspaceNavProvider>
                  <WorkspaceShell
                    skipLabel={t("skipToContent")}
                    copilotUrl={copilotUrl}
                    sidebar={
                      <AppSidebar
                        orgSlug={orgSlug}
                        copilotUrl={copilotUrl}
                        projectsUrl={appOrigin("projects")}
                        messagesUrl={appOrigin("messages")}
                        filesUrl={appOrigin("files")}
                      />
                    }
                    banners={
                      <>
                        {workspace.impersonatedBy ? (
                          <ImpersonationBanner name={workspace.user.name} />
                        ) : null}
                        {workspace.deletionScheduledAt ? (
                          <DeletionBanner
                            scheduledAt={workspace.deletionScheduledAt}
                            orgSlug={orgSlug}
                          />
                        ) : null}
                      </>
                    }
                    header={
                      <SiteHeader
                        title={sidebar("calendars")}
                        organizations={organizations}
                        activeOrganizationId={workspace.organization.id}
                        user={workspace.user}
                        returnTo={`/${locale}/${orgSlug}/calendars`}
                        accountUrl={`${copilotUrl}/${locale}/${orgSlug}/settings/account`}
                      />
                    }
                  >
                    {children}
                  </WorkspaceShell>
                </WorkspaceNavProvider>
              </CalendarsProvider>
            </PermissionsProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
