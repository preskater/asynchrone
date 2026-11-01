"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { CalendarX2Icon, MapPinIcon, VideoIcon } from "lucide-react"

import {
  eachDay,
  formatDayLabel,
  formatEventRange,
  isSameDay,
} from "@workspace/calendars/date-utils"
import { EVENT_COLOR_CLASSES } from "@/lib/calendars/event-colors"
import { tasksOnDay } from "@/lib/calendars/tasks"
import { TaskChip } from "@/components/calendars/task-chip"
import { MemberAvatar } from "@workspace/projects/components/task/member-avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

import { useCalendars } from "@/lib/calendars/store"
import { useProjectStore } from "@workspace/projects/store"
import type { CalendarEvent } from "@workspace/calendars/types"

function EventRow({
  event,
  onOpen,
  colorClass,
}: {
  event: CalendarEvent
  onOpen: (event: CalendarEvent) => void
  colorClass: string
}) {
  const locale = useLocale()
  const t = useTranslations("Calendars")
  const tc = useTranslations("Common")
  const { getCalendar, getMember } = useCalendars()
  const calendar = getCalendar(event.calendarId)
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-muted/50"
    >
      <span className={cn("mt-1 size-2.5 shrink-0 rounded-full", colorClass)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{event.title}</span>
          {calendar ? <Badge variant="outline">{calendar.name}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{formatEventRange(event, locale, tc("allDay"))}</span>
          {event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPinIcon className="size-3" />
              {event.location}
            </span>
          ) : null}
          {event.meetingUrl ? (
            <span className="inline-flex items-center gap-1">
              <VideoIcon className="size-3" />
              {t("online")}
            </span>
          ) : null}
        </div>
      </div>
      {event.attendees.length > 0 ? (
        <div className="flex -space-x-2">
          {event.attendees.slice(0, 4).map((attendee) => (
            <MemberAvatar
              key={attendee.memberId}
              member={getMember(attendee.memberId)}
              size="sm"
            />
          ))}
        </div>
      ) : null}
    </button>
  )
}

export function AgendaView({
  focusDate,
  onOpenEvent,
}: {
  focusDate: Date
  onOpenEvent: (event: CalendarEvent) => void
}) {
  const locale = useLocale()
  const t = useTranslations("Calendars")
  const tc = useTranslations("Common")
  const { eventsOnDay, showTasks } = useCalendars()
  const { tasks } = useProjectStore()
  const days = eachDay(focusDate, new Date(focusDate.getTime() + 13 * 86400000))
  const groups = days
    .map((day) => ({
      day,
      events: eventsOnDay(day),
      tasks: showTasks ? tasksOnDay(tasks, day) : [],
    }))
    .filter((group) => group.events.length > 0 || group.tasks.length > 0)
  if (groups.length === 0) {
    return (
      <Empty className="flex-1">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarX2Icon />
          </EmptyMedia>
          <EmptyTitle>{t("noEventsScheduled")}</EmptyTitle>
          <EmptyDescription>{t("nothingNextTwoWeeks")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div
      tabIndex={0}
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
    >
      {groups.map((group) => (
        <Card key={group.day.toISOString()}>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">
              {formatDayLabel(group.day, locale, tc)}
              {!isSameDay(group.day, new Date()) ? (
                <span className="ms-2 text-xs font-normal text-muted-foreground">
                  {group.day.toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 pt-2">
            {group.events.map((event, index) => (
              <React.Fragment key={event.id}>
                {index > 0 ? <Separator /> : null}
                <EventRow
                  event={event}
                  onOpen={onOpenEvent}
                  colorClass={EVENT_COLOR_CLASSES[event.color].dot}
                />
              </React.Fragment>
            ))}
            {group.tasks.map((task) => (
              <TaskChip key={task.id} task={task} />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
