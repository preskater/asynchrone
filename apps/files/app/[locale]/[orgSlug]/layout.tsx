import { getTranslations } from "next-intl/server"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import { DeletionBanner } from "@workspace/app-shell/deletion-banner"
import { ImpersonationBanner } from "@workspace/app-shell/impersonation-banner"
import { RecentsProvider } from "@workspace/app-shell/recents"
import { WorkspaceShell } from "@workspace/app-shell/shell"
import { appOrigin } from "@workspace/contracts/server"
import type { FilesData } from "@workspace/files/types"
import { EntitlementsProvider } from "@workspace/organization/use-entitlements"
import { toMemberDirectoryEntry } from "@workspace/organization/directory"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { AppSidebar } from "@/components/app-sidebar"
import { FilesShellProvider } from "@/components/files-provider"
import { SiteHeader } from "@/components/site-header"
import { getOrganizationAppearance } from "@/lib/appearance"
import { requireFilesWorkspace } from "@/lib/auth/workspace"
import { listUserOrganizations } from "@/lib/organization"
import { prisma } from "@/lib/prisma"

/** Domain screens hydrate their own data; the shell starts empty. */
const EMPTY_FILES_DATA: FilesData = {
  files: [],
  shares: {},
  versions: {},
  activities: {},
}

/**
 * The workspace shell for the files host.
 *
 * Every request resolves the session, the organization and the plan here; the
 * screens below never render without them. Files data is loaded in this app
 * (`listFilesAction` on first open) — Copilot no longer mounts a files
 * provider.
 */
export default async function OrgLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string; orgSlug: string }>
}>) {
  const { locale, orgSlug } = await params
  const workspace = await requireFilesWorkspace({
    locale,
    orgSlug,
    returnTo: `/${locale}/${orgSlug}/files`,
  })

  const [appearance, memberships, memberRows] = await Promise.all([
    getOrganizationAppearance(workspace.organization.id),
    listUserOrganizations(workspace.user.id),
    prisma.member.findMany({
      where: { organizationId: workspace.organization.id, clientId: null },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  const t = await getTranslations("Common")
  const sidebar = await getTranslations("Sidebar")
  const copilotUrl = appOrigin("copilot")
  const organizations = memberships.map(({ organization }) => organization)
  // Organization members never carry the client role; the directory type keeps
  // it for portal rows, so normalize it for the workspace providers.
  const members = memberRows.map(toMemberDirectoryEntry).map((member) => ({
    ...member,
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
            <FilesShellProvider
              initialData={EMPTY_FILES_DATA}
              currentUserId={workspace.user.id}
              organizationId={workspace.organization.id}
              storageQuotaBytes={workspace.storageQuotaBytes}
              members={members}
            >
              <WorkspaceShell
                skipLabel={t("skipToContent")}
                sidebar={
                  <AppSidebar
                    orgSlug={orgSlug}
                    copilotUrl={copilotUrl}
                    projectsUrl={appOrigin("projects")}
                    messagesUrl={appOrigin("messages")}
                    calendarsUrl={appOrigin("calendars")}
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
                    title={sidebar("files")}
                    organizations={organizations}
                    activeOrganizationId={workspace.organization.id}
                    user={workspace.user}
                    returnTo={`/${locale}/${orgSlug}/files`}
                    accountUrl={`${copilotUrl}/${locale}/${orgSlug}/settings/account`}
                  />
                }
              >
                {children}
              </WorkspaceShell>
            </FilesShellProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
