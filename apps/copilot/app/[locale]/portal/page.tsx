import { redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { CalendarDaysIcon, DownloadIcon, FileTextIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"

import { Link } from "@workspace/i18n/navigation"
import { getPortalContext } from "@/lib/portal/context"
import { portalService } from "@/lib/portal"
import { PortalSeenTracker } from "@workspace/portal/components/portal-seen-tracker"
import { PortalUpload } from "@workspace/portal/components/portal-upload"

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export default async function PortalDashboardPage() {
  const ctx = await getPortalContext()
  if (!ctx) redirect("/onboarding")

  const [data, t, tEnums, locale] = await Promise.all([
    portalService.getDashboard(ctx),
    getTranslations("Portal"),
    getTranslations("Enums"),
    getLocale(),
  ])

  const date = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          new Date(iso)
        )
      : undefined

  return (
    <div className="flex flex-col gap-6">
      <PortalSeenTracker />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {t("welcome", { name: data.clientName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("dashboardDescription")}
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("projectsTitle")}
        </h2>
        {data.projects.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("noProjects")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.projects.map((project) => {
              const percent =
                project.totalTasks > 0
                  ? Math.round((project.doneTasks / project.totalTasks) * 100)
                  : 0
              return (
                <Card key={project.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/portal/projects/${project.id}`}
                        prefetch={false}
                        className="text-base font-semibold hover:underline"
                      >
                        {project.name}
                      </Link>
                      <div className="flex shrink-0 items-center gap-2">
                        {project.unreadCount > 0 ? (
                          <Badge>
                            {t("unreadBadge", {
                              count: project.unreadCount,
                            })}
                          </Badge>
                        ) : null}
                        <Badge variant="secondary">
                          {tEnums(`projectStatus.${project.status}` as never)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {t("tasksProgress", {
                            done: project.doneTasks,
                            total: project.totalTasks,
                          })}
                        </span>
                        <span>{t("percentComplete", { percent })}</span>
                      </div>
                      <Progress value={percent} />
                    </div>
                    {project.dueDate ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarDaysIcon className="size-3.5" />
                        {t("dueDate", { date: date(project.dueDate) ?? "" })}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("documentsTitle")}
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href="/portal/documents"
              prefetch={false}
              className="text-xs text-muted-foreground hover:underline"
            >
              {t("viewAll")}
            </Link>
            <PortalUpload />
          </div>
        </div>
        <Card>
          <CardContent>
            {data.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noDocuments")}
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-center gap-2 border-b pb-3 last:border-b-0 last:pb-0"
                  >
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <a
                        href={`/api/portal/files/${document.fileId}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 truncate text-sm font-medium hover:underline"
                      >
                        {document.name}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {[
                          formatBytes(document.sizeBytes),
                          date(document.createdAt),
                          document.addedByName,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {document.isNew ? <Badge>{t("newBadge")}</Badge> : null}
                    <a
                      href={`/api/portal/files/${document.fileId}/download`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
                    >
                      <DownloadIcon className="size-3.5" />
                      {t("download")}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
