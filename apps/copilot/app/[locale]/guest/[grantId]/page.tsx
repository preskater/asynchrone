import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"

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
import { PortalDiscussion } from "@workspace/portal/components/portal-discussion"

import { guestProjects } from "@/lib/guests"
import { requireGuestContext } from "@/lib/guests/session"

export default async function GuestProjectPage({
  params,
}: {
  params: Promise<{ grantId: string }>
}) {
  const { grantId } = await params
  const ctx = await requireGuestContext(grantId).catch(() => notFound())
  const canReadMessages = guestCan(ctx, "message:read")

  let project, messages
  try {
    ;[project, messages] = await Promise.all([
      guestProjects.getProject(ctx),
      canReadMessages ? guestProjects.listMessages(ctx) : [],
    ])
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound()
    throw error
  }

  const [t, tEnums, format] = await Promise.all([
    getTranslations("Guests"),
    getTranslations("Enums"),
    getFormatter(),
  ])

  return (
    <>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("tasksTitle")}</CardTitle>
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
                    href={`/guest/${grantId}/tasks/${task.id}`}
                    prefetch={false}
                    className="min-w-0 truncate text-sm hover:underline"
                  >
                    <span className="me-2 text-muted-foreground">
                      {task.identifier}
                    </span>
                    {task.title}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {task.dueDate ? (
                      <span className="text-xs text-muted-foreground">
                        {format.dateTime(new Date(task.dueDate), {
                          dateStyle: "medium",
                        })}
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

      {canReadMessages ? (
        <PortalDiscussion
          projectId={project.id}
          messages={messages}
          canPost={guestCan(ctx, "message:write")}
        />
      ) : null}
    </>
  )
}
