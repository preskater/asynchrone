import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { FileTextIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Link } from "@workspace/i18n/navigation"

import { getPortalContext } from "@/lib/portal/context"
import { portalService } from "@/lib/portal"

/** The test reports the team shared with the client's company (#132). */
export default async function PortalReportsPage() {
  const ctx = await getPortalContext()
  if (!ctx) redirect("/onboarding")

  const [reports, t, enums, locale] = await Promise.all([
    portalService.getReleaseReports(ctx),
    getTranslations("Portal"),
    getTranslations("Enums"),
    getLocale(),
  ])
  const day = (key: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(`${key}T00:00:00`)
    )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("reportsPageTitle")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("reportsPageDescription")}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {reports.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {t("reportsEmpty")}
            </p>
          ) : (
            <ul className="divide-y">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link
                    href={`/portal/reports/${report.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-3">
                      <FileTextIcon className="size-4 text-muted-foreground" />
                      <span className="font-medium tabular-nums">
                        {report.version}
                      </span>
                      {report.label ? (
                        <span className="text-sm text-muted-foreground">
                          {report.label}
                        </span>
                      ) : null}
                      <Badge variant="secondary">
                        {enums(`clientReleaseStatus.${report.status}` as never)}
                      </Badge>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {report.releasedAt ? `${day(report.releasedAt)} · ` : ""}
                      {t("reportsCounts", {
                        open: report.openCount,
                        count: report.feedbackCount,
                      })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
