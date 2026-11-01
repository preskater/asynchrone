import { getTranslations } from "next-intl/server"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import { ImpersonationBanner } from "@workspace/app-shell/impersonation-banner"
import { RecentsProvider } from "@workspace/app-shell/recents"
import { WorkspaceShell } from "@workspace/app-shell/shell"
import { appOrigin } from "@workspace/contracts/server"
import { EntitlementsProvider } from "@workspace/organization/use-entitlements"
import { roleRank } from "@workspace/organization/roles"
import { ProjectStoreProvider } from "@workspace/projects/store"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { ProjectSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { getOrganizationAppearance } from "@/lib/appearance"
import { requireProjectWorkspace, toRequestContext } from "@/lib/auth/workspace"
import { listUserOrganizations } from "@/lib/organization"
import { PROJECT_ACTIONS } from "@/lib/project-actions"
import { projectService } from "@/lib/projects"

/**
 * The workspace shell for the projects host.
 *
 * Every request resolves the session, the organization and the plan here; the
 * screens below never render without them. Project data is loaded in this app
 * (`listShell` below, tasks on demand from the store) — Copilot no longer
 * mounts a project provider.
 */
export default async function OrgLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string; orgSlug: string }>
}>) {
  const { locale, orgSlug } = await params
  const workspace = await requireProjectWorkspace({
    locale,
    orgSlug,
    returnTo: `/${locale}/${orgSlug}/projects`,
  })
  const ctx = toRequestContext(workspace)

  const [initialData, appearance, memberships] = await Promise.all([
    projectService.listShell(ctx),
    getOrganizationAppearance(workspace.organization.id),
    listUserOrganizations(workspace.user.id),
  ])

  const t = await getTranslations("Common")
  const copilotUrl = appOrigin("copilot")
  const messagesUrl = appOrigin("messages")
  const organizations = memberships.map(({ organization }) => organization)

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={workspace.entitlements}>
        <AppearanceProvider
          initialAppearance={appearance}
          userId={workspace.user.id}
        >
          <RecentsProvider organizationId={workspace.organization.id}>
            <ProjectStoreProvider
              initialData={initialData}
              currentUserId={workspace.user.id}
              actions={PROJECT_ACTIONS}
              canManageMembers={roleRank(workspace.role) >= 3}
            >
              <WorkspaceShell
                skipLabel={t("skipToContent")}
                sidebar={
                  <ProjectSidebar
                    orgSlug={orgSlug}
                    copilotUrl={copilotUrl}
                    messagesUrl={messagesUrl}
                  />
                }
                banners={
                  workspace.impersonatedBy ? (
                    <ImpersonationBanner name={workspace.user.name} />
                  ) : null
                }
                header={
                  <SiteHeader
                    organizations={organizations}
                    activeOrganizationId={workspace.organization.id}
                    user={workspace.user}
                    returnTo={`/${locale}/${orgSlug}/projects`}
                    accountUrl={`${copilotUrl}/${locale}/${orgSlug}/settings/account`}
                  />
                }
              >
                {children}
              </WorkspaceShell>
            </ProjectStoreProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
