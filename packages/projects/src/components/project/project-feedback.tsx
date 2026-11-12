"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { ExternalLinkIcon, ListTodoIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"
import { useEnumLabel } from "@workspace/i18n/labels"

import { useProjectActions } from "../../ui/actions"
import type { ProjectFeedbackReleaseData } from "../../types"

/**
 * What the client reported on each release of this project. The clients app
 * owns the data; this tab only reads it and opens converted tasks here.
 */
export function ProjectFeedback({
  projectId,
  onOpenTask,
}: {
  projectId: string
  onOpenTask: (taskId: string) => void
}) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const locale = useLocale()
  const { listProjectFeedback } = useProjectActions()
  const [releases, setReleases] = React.useState<
    ProjectFeedbackReleaseData[] | null
  >(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (!listProjectFeedback) return
    let cancelled = false
    void listProjectFeedback(projectId).then((result) => {
      if (cancelled) return
      if (result.ok) setReleases(result.data)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [listProjectFeedback, projectId])

  const dateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("feedbackUnavailable")}
      </p>
    )
  }
  if (!releases) return <Spinner className="size-5" />
  if (releases.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("feedbackEmpty")}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {releases.map((release) => (
        <Card key={release.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <CardTitle className="text-xl tabular-nums">
                    {release.version}
                  </CardTitle>
                  {release.label ? (
                    <span className="text-sm text-muted-foreground">
                      {release.label}
                    </span>
                  ) : null}
                  <Badge variant="secondary">
                    {L.clientReleaseStatus(release.status)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {release.clientName} ·{" "}
                  {t("feedbackCounts", {
                    open: release.openCount,
                    count: release.feedbackCount,
                  })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<a href={release.url} />}
              >
                <ExternalLinkIcon data-icon="inline-start" />
                {t("feedbackOpenInClients")}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {release.feedback.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("feedbackNone")}
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {release.feedback.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium">{item.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[item.contactName, dateTime(item.testedAt)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {L.feedbackImpact(item.impact)}
                      </Badge>
                      <Badge variant="secondary">
                        {L.clientFeedbackStatus(item.status)}
                      </Badge>
                      {item.linkedTaskId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => onOpenTask(item.linkedTaskId!)}
                        >
                          <ListTodoIcon data-icon="inline-start" />
                          {t("feedbackOpenTask")}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
