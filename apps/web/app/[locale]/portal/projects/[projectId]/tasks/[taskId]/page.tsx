import { notFound, redirect } from "next/navigation"
import { getLocale, getTranslations } from "next-intl/server"
import { ArrowLeftIcon, CalendarDaysIcon, CheckIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { Link } from "@workspace/i18n/navigation"
import { PortalSeenTracker } from "@/components/portal/portal-seen-tracker"
import { PortalTaskComments } from "@/components/portal/portal-task-comments"
import { PriorityBadge } from "@workspace/projects/components/task/task-badge"
import { getPortalContext } from "@/lib/portal/context"
import { portalService } from "@/lib/portal"
import { isAppError } from "@workspace/core/errors"

export default async function PortalTaskPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>
}) {
  const { projectId, taskId } = await params

  const ctx = await getPortalContext()
  if (!ctx) redirect("/onboarding")

  const [t, tEnums, locale] = await Promise.all([
    getTranslations("Portal"),
    getTranslations("Enums"),
    getLocale(),
  ])

  let detail
  try {
    detail = await portalService.getTaskDetail(ctx, projectId, taskId)
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") {
      notFound()
    }
    throw error
  }

  const { task, comments } = detail
  const date = (iso?: string) =>
    iso
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          new Date(iso)
        )
      : undefined

  return (
    <div className="flex flex-col gap-6">
      <PortalSeenTracker />
      <Link
        href={`/portal/projects/${projectId}`}
        prefetch={false}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeftIcon className="size-4" />
        {t("backToProject")}
      </Link>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{task.identifier}</span>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{task.title}</h1>
          <Badge variant="secondary">
            {tEnums(`taskStatus.${task.status}` as never)}
          </Badge>
          <PriorityBadge priority={task.priority} />
        </div>
        {task.labels.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {task.labels.map((label) => (
              <Badge key={label} variant="outline">
                {label}
              </Badge>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-muted-foreground">
          {task.dueDate ? (
            <span className="flex items-center gap-1.5">
              <CalendarDaysIcon className="size-3.5" />
              {t("dueDate", { date: date(task.dueDate) ?? "" })}
            </span>
          ) : null}
          {task.endDate ? (
            <span className="flex items-center gap-1.5">
              <CalendarDaysIcon className="size-3.5" />
              {t("endDate", { date: date(task.endDate) ?? "" })}
            </span>
          ) : null}
        </div>
        {task.description ? (
          <p className="max-w-2xl pt-2 text-sm whitespace-pre-wrap text-muted-foreground">
            {task.description}
          </p>
        ) : null}
      </div>

      {task.subtasks.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("checklistTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2.5">
              {task.subtasks.map((subtask) => (
                <li
                  key={subtask.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={
                      subtask.done
                        ? "flex size-4 items-center justify-center rounded-sm bg-primary text-primary-foreground"
                        : "size-4 rounded-sm border"
                    }
                  >
                    {subtask.done ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span
                    className={
                      subtask.done ? "text-muted-foreground line-through" : ""
                    }
                  >
                    {subtask.title}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("commentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalTaskComments
            projectId={projectId}
            taskId={task.id}
            comments={comments}
            canPost={detail.commentsPolicy === "read_write"}
          />
        </CardContent>
      </Card>
    </div>
  )
}
