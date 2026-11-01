"use client"

import {
  CheckCircle2Icon,
  CircleDotIcon,
  ListTodoIcon,
  TrendingUpIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { MemberAvatar } from "../task/member-avatar"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import { Progress } from "@workspace/ui/components/progress"
import { Separator } from "@workspace/ui/components/separator"

import { useProjectStore } from "../../ui/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import { parseActivityTarget } from "../../activity"
import { formatDate, TASK_STATUS_VALUES, type Project } from "../../types"

export function ProjectOverview({ project }: { project: Project }) {
  const t = useTranslations("Projects")
  const tActivity = useTranslations("Activity")
  const locale = useLocale()
  const L = useEnumLabel()

  const renderActivityTarget = (target: string) => {
    const parsed = parseActivityTarget(target)
    if (parsed.status) {
      return tActivity("taskMoved", {
        identifier: parsed.identifier,
        status: L.taskStatus(parsed.status),
      })
    }
    return parsed.identifier
  }
  const chartConfig = {
    count: { label: t("tasksChart"), color: "var(--chart-2)" },
  } satisfies ChartConfig
  const store = useProjectStore()
  const tasks = store.tasksForProject(project.id)
  const activities = store.activitiesForProject(project.id)

  const done = tasks.filter((task) => task.status === "done").length
  const inProgress = tasks.filter(
    (task) => task.status === "in_progress" || task.status === "review"
  ).length
  const todo = tasks.filter(
    (task) => task.status === "todo" || task.status === "backlog"
  ).length
  const overdue = tasks.filter(
    (task) =>
      task.dueDate &&
      task.status !== "done" &&
      new Date(task.dueDate) < new Date(new Date().toDateString())
  ).length
  const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  const metrics = [
    {
      label: t("totalTasks"),
      value: String(tasks.length),
      hint: t("memberCount", { count: project.memberIds.length }),
      icon: ListTodoIcon,
    },
    {
      label: t("inProgress"),
      value: String(inProgress),
      hint: t("activeWork"),
      icon: CircleDotIcon,
    },
    {
      label: t("completed"),
      value: `${completion}%`,
      hint: t("doneOf", { done, total: tasks.length }),
      icon: CheckCircle2Icon,
    },
    {
      label: t("overdue"),
      value: String(overdue),
      hint: t("needsAttention"),
      icon: TrendingUpIcon,
    },
  ]

  const statusData = TASK_STATUS_VALUES.filter(
    (status) => status !== "done"
  ).map((status) => ({
    status: L.taskStatus(status),
    count: tasks.filter((task) => task.status === status).length,
  }))

  const workload = project.memberIds
    .map((id) => {
      const member = store.getMember(id)
      const assigned = tasks.filter((task) => task.assigneeId === id)
      return {
        member,
        total: assigned.length,
        done: assigned.filter((task) => task.status === "done").length,
      }
    })
    .filter(
      (
        entry
      ): entry is {
        member: NonNullable<typeof entry.member>
        total: number
        done: number
      } => entry.member !== undefined
    )
    .sort((a, b) => b.total - a.total)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 @3xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums">
                {metric.value}
              </CardTitle>
              <CardAction>
                <metric.icon className="size-4 text-muted-foreground" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{metric.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("tasksByStatus")}</CardTitle>
            <CardDescription>
              {t("tasksByStatusDescription", { project: project.name })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-64 w-full">
              <BarChart accessibilityLayer data={statusData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="status"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={24}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={6} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("progress")}</CardTitle>
            <CardDescription>
              {t("progressComplete", { completion })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Progress value={completion} />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("toDo")}</span>
                <span className="tabular-nums">{todo}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("inProgress")}</span>
                <span className="tabular-nums">{inProgress}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("doneColumn")}</span>
                <span className="tabular-nums">{done}</span>
              </div>
              {project.dueDate ? (
                <>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {t("targetDate")}
                    </span>
                    <span>{formatDate(project.dueDate, locale)}</span>
                  </div>
                </>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("teamWorkload")}</CardTitle>
            <CardDescription>{t("teamWorkloadDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {workload.length ? (
              workload.map(({ member, total, done: memberDone }) => (
                <div key={member.id} className="flex items-center gap-3">
                  <MemberAvatar member={member} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {member.name}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {memberDone}/{total}
                      </span>
                    </div>
                    <Progress value={total ? (memberDone / total) * 100 : 0} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("noMembersAssigned")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("recentActivity")}</CardTitle>
            <CardDescription>{t("recentActivityDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {activities.length ? (
              activities.slice(0, 6).map((activity) => {
                const actor = store.getMember(activity.actorId)
                return (
                  <div key={activity.id} className="flex items-start gap-3">
                    <MemberAvatar member={actor} size="sm" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm">
                        <span className="font-medium">
                          {actor?.name ?? t("someone")}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {tActivity(activity.action as never)}
                        </span>{" "}
                        <span className="font-medium">
                          {renderActivityTarget(activity.target)}
                        </span>
                      </p>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(activity.createdAt, locale)}
                      </span>
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
