import { getTranslations } from "next-intl/server"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import { ImpersonationBanner } from "@workspace/app-shell/impersonation-banner"
import { RecentsProvider } from "@workspace/app-shell/recents"
import { WorkspaceShell } from "@workspace/app-shell/shell"
import { ClientActionsProvider } from "@workspace/clients/components/actions"
import { appOrigin } from "@workspace/contracts/server"
import { EntitlementsProvider } from "@workspace/organization/use-entitlements"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { ClientSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { getOrganizationAppearance } from "@/lib/appearance"
import { requireClientWorkspace } from "@/lib/auth/workspace"
import { CLIENT_ACTIONS } from "@/lib/client-actions"

/**
 * The workspace shell for the clients host.
 *
 * Every request resolves the session, the organization and the plan here; the
 * screens below never render without them. The CRM data is loaded per page
 * (the clients UI keeps its lists in the server-rendered payload).
 */
export default async function OrgLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string; orgSlug: string }>
}>) {
  const { locale, orgSlug } = await params
  const workspace = await requireClientWorkspace({
    locale,
    orgSlug,
    returnTo: `/${locale}/${orgSlug}/clients`,
  })
  const [appearance] = await Promise.all([
    getOrganizationAppearance(workspace.organization.id),
  ])

  const t = await getTranslations("Common")
  const copilotUrl = appOrigin("copilot")
  const organizations = workspace.organizations

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={workspace.entitlements}>
        <AppearanceProvider
          initialAppearance={appearance}
          userId={workspace.user.id}
        >
          <RecentsProvider organizationId={workspace.organization.id}>
            <ClientActionsProvider actions={CLIENT_ACTIONS}>
              <WorkspaceShell
                skipLabel={t("skipToContent")}
                sidebar={
                  <ClientSidebar orgSlug={orgSlug} copilotUrl={copilotUrl} />
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
                    returnTo={`/${locale}/${orgSlug}/clients`}
                    accountUrl={`${copilotUrl}/${locale}/${orgSlug}/settings/account`}
                  />
                }
              >
                {children}
              </WorkspaceShell>
            </ClientActionsProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
