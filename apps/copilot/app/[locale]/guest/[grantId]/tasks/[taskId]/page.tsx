import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { ArrowLeftIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { guestCan } from "@workspace/core/guests"
import { isAppError } from "@workspace/core/errors"
import { Link } from "@workspace/i18n/navigation"
import { PortalTaskComments } from "@workspace/portal/components/portal-task-comments"

import { GuestTaskStatus } from "@/components/guests/guest-controls"
import { guestProjects } from "@/lib/guests"
import { requireGuestContext } from "@/lib/guests/session"

export default async function GuestTaskPage({
  params,
}: {
  params: Promise<{ grantId: string; taskId: string }>
}) {
  const { grantId, taskId } = await params
  const ctx = await requireGuestContext(grantId).catch(() => notFound())

  let task, comments
  try {
    ;[task, comments] = await Promise.all([
      guestProjects.getTask(ctx, taskId),
      guestProjects.listTaskComments(ctx, taskId),
    ])
  } catch (error) {
    // A task of another project or organization is simply not there.
    if (isAppError(error) && error.code === "not_found") notFound()
    throw error
  }

  const [t, tEnums] = await Promise.all([
    getTranslations("Guests"),
    getTranslations("Enums"),
  ])

  return (
    <>
      <Link
        href={`/guest/${grantId}`}
        prefetch={false}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeftIcon className="size-4" />
        {ctx.projectName}
      </Link>

      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">{task.identifier}</span>
        <h1 className="text-2xl font-semibold">{task.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {guestCan(ctx, "task:write") ? (
            <GuestTaskStatus
              grantId={grantId}
              taskId={task.id}
              status={task.status}
            />
          ) : (
            <Badge variant="outline">
              {tEnums(`taskStatus.${task.status}` as never)}
            </Badge>
          )}
          {task.labels.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
            </Badge>
          ))}
        </div>
        {task.description ? (
          <p className="max-w-2xl text-sm whitespace-pre-wrap text-muted-foreground">
            {task.description}
          </p>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("commentsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalTaskComments
            projectId={ctx.projectId}
            taskId={task.id}
            comments={comments}
            canPost={guestCan(ctx, "task:comment")}
          />
        </CardContent>
      </Card>
    </>
  )
}
