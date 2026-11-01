"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import { MemberAvatar } from "@/components/task/member-avatar"
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  addDays,
  endOfEventDay,
  eventsOnDay,
  startOfEventDay,
  startOfWeek,
} from "@workspace/calendars/date-utils"
import { EVENT_COLOR_CLASSES } from "@/lib/calendars/event-colors"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { useCalendars } from "@/lib/calendars/store"
import type { CalendarEvent } from "@workspace/calendars/types"

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, index) => DAY_START_HOUR + index
)

export function AvailabilityView({
  focusDate,
  selectedMemberIds,
  onOpenEvent,
}: {
  focusDate: Date
  selectedMemberIds: string[]
  onOpenEvent: (event: CalendarEvent) => void
}) {
  const locale = useLocale()
  const t = useTranslations("Calendars")
  const { getMember, eventsOnDay } = useCalendars()
  const weekStart = startOfWeek(focusDate)
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index)
  )
  const slotCount = HOURS.length - 1

  return (
    <div tabIndex={0} className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="sticky top-0 z-10 flex border-b bg-background">
        <div className="w-44 shrink-0 border-e px-3 py-2 text-xs font-medium text-muted-foreground">
          {t("teamMember")}
        </div>
        <div className="flex flex-1">
          {days.map((day) => (
            <div
              key={day.toISOString()}
              className="flex flex-1 flex-col items-center border-e py-1.5 last:border-e-0"
            >
              <span className="text-xs text-muted-foreground">
                {day.toLocaleDateString(locale, { weekday: "short" })}
              </span>
              <span className="text-sm font-medium tabular-nums">
                {day.getDate()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {selectedMemberIds.map((memberId) => {
        const member = getMember(memberId)
        if (!member) return null
        return (
          <div key={memberId} className="flex border-b last:border-b-0">
            <div className="flex w-44 shrink-0 items-center gap-2 border-e px-3 py-2">
              <MemberAvatar member={member} size="sm" />
              <span className="truncate text-sm">{member.name}</span>
            </div>
            <div className="flex flex-1">
              {days.map((day) => {
                const dayEvents = eventsOnDay(day).filter((event) =>
                  event.attendees.some(
                    (attendee) => attendee.memberId === memberId
                  )
                )
                const slots = new Array(slotCount).fill(false)
                for (const event of dayEvents) {
                  const start = Math.floor(
                    (startOfEventDay(event, day) - DAY_START_HOUR * 60) / 60
                  )
                  const end = Math.ceil(
                    (endOfEventDay(event, day) - DAY_START_HOUR * 60) / 60
                  )
                  for (let index = start; index < end; index += 1) {
                    if (index >= 0 && index < slots.length) slots[index] = true
                  }
                }
                return (
                  <div
                    key={day.toISOString()}
                    className="flex flex-1 flex-col border-e last:border-e-0"
                  >
                    {slots.map((busy, index) => {
                      const hour = DAY_START_HOUR + index
                      const event = dayEvents.find((item) => {
                        const start = startOfEventDay(item, day)
                        const end = endOfEventDay(item, day)
                        return (
                          startOfEventDay(item, day) < (hour + 1) * 60 &&
                          end > hour * 60
                        )
                      })
                      return (
                        <Tooltip key={index}>
                          <TooltipTrigger render={<span className="block" />}>
                            <div
                              role="presentation"
                              onClick={() => event && onOpenEvent(event)}
                              className={cn(
                                "h-6 border-b border-border/40",
                                busy
                                  ? cn(
                                      "cursor-pointer",
                                      event
                                        ? EVENT_COLOR_CLASSES[event.color].chip
                                        : "bg-muted"
                                    )
                                  : "bg-muted/10"
                              )}
                            />
                          </TooltipTrigger>
                          {busy && event ? (
                            <TooltipContent side="top">
                              <p className="text-xs font-medium">
                                {event.title}
                              </p>
                            </TooltipContent>
                          ) : null}
                        </Tooltip>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
