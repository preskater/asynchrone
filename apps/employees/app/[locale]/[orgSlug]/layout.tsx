import { getTranslations } from "next-intl/server"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import { ImpersonationBanner } from "@workspace/app-shell/impersonation-banner"
import { RecentsProvider } from "@workspace/app-shell/recents"
import { WorkspaceShell } from "@workspace/app-shell/shell"
import { EmployeeActionsProvider } from "@workspace/employees/components/actions"
import { appOrigin } from "@workspace/contracts/server"
import { EntitlementsProvider } from "@workspace/organization/use-entitlements"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { EmployeeSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { getOrganizationAppearance } from "@/lib/appearance"
import {
  requireEmployeeWorkspace,
  toRequestContext,
} from "@/lib/auth/workspace"
import { EMPLOYEE_ACTIONS } from "@/lib/employee-actions"
import { listUserOrganizations } from "@/lib/organization"

/**
 * The workspace shell for the employees host.
 *
 * Every request resolves the session, the organization and the plan here; the
 * screens below never render without them. Payroll and the salary profiles stay
 * behind `isAdmin`/`requireAdmin` in `@workspace/employees`; the shell only
 * exposes the role it resolved.
 */
export default async function OrgLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string; orgSlug: string }>
}>) {
  const { locale, orgSlug } = await params
  const workspace = await requireEmployeeWorkspace({
    locale,
    orgSlug,
    returnTo: `/${locale}/${orgSlug}/employees`,
  })

  const [appearance, memberships] = await Promise.all([
    getOrganizationAppearance(workspace.organization.id),
    listUserOrganizations(workspace.user.id),
  ])

  const t = await getTranslations("Common")
  const copilotUrl = appOrigin("copilot")
  const organizations = memberships.map(({ organization }) => organization)

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={workspace.entitlements}>
        <AppearanceProvider
          initialAppearance={appearance}
          userId={workspace.user.id}
        >
          <RecentsProvider organizationId={workspace.organization.id}>
            <EmployeeActionsProvider actions={EMPLOYEE_ACTIONS}>
              <WorkspaceShell
                skipLabel={t("skipToContent")}
                sidebar={
                  <EmployeeSidebar orgSlug={orgSlug} copilotUrl={copilotUrl} />
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
                    returnTo={`/${locale}/${orgSlug}/employees`}
                    accountUrl={`${copilotUrl}/${locale}/${orgSlug}/settings/account`}
                  />
                }
              >
                {children}
              </WorkspaceShell>
            </EmployeeActionsProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
