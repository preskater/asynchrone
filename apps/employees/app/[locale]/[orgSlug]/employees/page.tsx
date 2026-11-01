import { getTranslations } from "next-intl/server"

import { EmployeesWorkspace } from "@workspace/employees/components/employees-workspace"

import { employeesService } from "@/lib/employees"
import { getPageContext } from "@/lib/request-context"

/**
 * The time & attendance workspace.
 *
 * The service resolves the caller's access from the OIDC session's role, so a
 * member never receives payroll or the team-wide views — the tabs and the
 * payload are built from the same `resolveEmployeeAccess` decision.
 */
export default async function EmployeePage() {
  const ctx = await getPageContext()
  const [data, t] = await Promise.all([
    employeesService.getOverview(ctx),
    getTranslations("AppPages"),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("employeesTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("employeesDescription")}
        </p>
      </div>
      <EmployeesWorkspace data={data} />
    </div>
  )
}
