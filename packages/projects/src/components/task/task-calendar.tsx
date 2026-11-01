"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { TaskCardContent } from "./task-card"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import type { Task } from "../../types"

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString()
}

export function TaskCalendar({
  tasks,
  onOpen,
}: {
  tasks: Task[]
  onOpen: (taskId: string) => void
}) {
  const t = useTranslations("Projects")
  const locale = useLocale()
  const [selected, setSelected] = React.useState<Date | undefined>(new Date())

  const tasksWithDue = tasks.filter((task) => task.dueDate)
  const dueDates = tasksWithDue.map((task) => new Date(task.dueDate as string))

  const dayTasks = selected
    ? tasksWithDue.filter((task) =>
        isSameDay(new Date(task.dueDate as string), selected)
      )
    : []

  const upcoming = [...tasksWithDue]
    .filter(
      (task) =>
        new Date(task.dueDate as string) >= new Date(new Date().toDateString())
    )
    .sort(
      (a, b) =>
        new Date(a.dueDate as string).getTime() -
        new Date(b.dueDate as string).getTime()
    )
    .slice(0, 5)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[auto_1fr]">
      <Card className="w-fit">
        <CardContent className="pt-4">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            modifiers={{ hasTasks: dueDates }}
            modifiersClassNames={{
              hasTasks:
                "relative after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary",
            }}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              {selected
                ? new Intl.DateTimeFormat(locale, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  }).format(selected)
                : t("selectDay")}
            </CardTitle>
            <CardDescription>
              {dayTasks.length
                ? t("tasksDue", { count: dayTasks.length })
                : t("noTasksDue")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {dayTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onOpen(task.id)}
                className={cn(
                  "rounded-xl bg-muted/40 p-3 text-start ring-1 ring-foreground/5 transition-colors hover:bg-muted"
                )}
              >
                <TaskCardContent task={task} />
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("upcoming")}</CardTitle>
            <CardDescription>{t("upcomingDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {upcoming.length ? (
              upcoming.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpen(task.id)}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-start text-sm transition-colors hover:bg-muted"
                >
                  <span className="truncate">
                    <span className="text-muted-foreground">
                      {task.identifier}
                    </span>{" "}
                    {task.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      month: "short",
                      day: "numeric",
                    }).format(new Date(task.dueDate as string))}
                  </span>
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("nothingScheduled")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
