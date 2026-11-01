import { notFound, redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ArrowLeftIcon, CalendarDaysIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"

import { Link } from "@workspace/i18n/navigation"
import { PortalDiscussion } from "@workspace/portal/components/portal-discussion"
import { PortalSeenTracker } from "@workspace/portal/components/portal-seen-tracker"
import { getPortalContext } from "@/lib/portal/context"
import { portalService } from "@/lib/portal"
import { isAppError } from "@workspace/core/errors"

export default async function PortalProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  const ctx = await getPortalContext()
  if (!ctx) redirect("/onboarding")

  const [t, tEnums, locale] = await Promise.all([
    getTranslations("Portal"),
    getTranslations("Enums"),
    getLocale(),
  ])

  let project
  try {
    project = await portalService.getProject(ctx, projectId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") {
      notFound()
    }
    throw error
  }

  const messages = await portalService.listMessages(ctx, projectId)
  const date = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          new Date(iso)
        )
      : undefined

  const done = project.tasks.filter((task) => task.status === "done").length
  const percent =
    project.tasks.length > 0
      ? Math.round((done / project.tasks.length) * 100)
      : 0

  return (
    <div className="flex flex-col gap-6">
      <PortalSeenTracker />
      <Link
        href="/portal"
        prefetch={false}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeftIcon className="size-4" />
        {t("backToDashboard")}
      </Link>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <Badge variant="secondary">
            {tEnums(`projectStatus.${project.status}` as never)}
          </Badge>
        </div>
        {project.description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {project.description}
          </p>
        ) : null}
        {project.dueDate ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDaysIcon className="size-3.5" />
            {t("dueDate", { date: date(project.dueDate) ?? "" })}
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("progressTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {t("tasksProgress", { done, total: project.tasks.length })}
            </span>
            <span>{t("percentComplete", { percent })}</span>
          </div>
          <Progress value={percent} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("milestonesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {project.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noTasks")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {project.tasks.map((task) => (
                <li
                  key={task.id}
                  className="flex items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
                >
                  <Link
                    href={`/portal/projects/${project.id}/tasks/${task.id}`}
                    prefetch={false}
                    className="min-w-0 truncate text-sm hover:underline"
                  >
                    {task.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {task.dueDate ? (
                      <span className="text-xs text-muted-foreground">
                        {date(task.dueDate)}
                      </span>
                    ) : null}
                    <Badge
                      variant={task.status === "done" ? "default" : "outline"}
                    >
                      {tEnums(`taskStatus.${task.status}` as never)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {project.discussionPolicy !== "none" ? (
        <PortalDiscussion
          projectId={project.id}
          messages={messages}
          canPost={project.discussionPolicy === "read_write"}
        />
      ) : null}
    </div>
  )
}
