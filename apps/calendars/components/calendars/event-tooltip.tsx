"use client"

import { useLocale, useTranslations } from "next-intl"

import { formatEventRange } from "@workspace/calendars/date-utils"
import { EVENT_COLOR_CLASSES } from "@/lib/calendars/event-colors"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { cn } from "@workspace/ui/lib/utils"

import { useCalendars } from "@/lib/calendars/store"
import type { CalendarEvent } from "@workspace/calendars/types"

const RESPONSE_DOT: Record<string, string> = {
  accepted: "bg-emerald-500",
  tentative: "bg-amber-500",
  declined: "bg-destructive",
  pending: "border border-muted-foreground/50",
}

export function EventTooltipContent({ event }: { event: CalendarEvent }) {
  const locale = useLocale()
  const t = useTranslations("Common")
  const { getCalendar, getMember } = useCalendars()
  const calendar = getCalendar(event.calendarId)
  const styles = EVENT_COLOR_CLASSES[event.color]

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={cn("size-2 rounded-full", styles.dot)} />
        <span className="text-xs font-medium">{event.title}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatEventRange(event, locale, t("allDay"))}
      </span>
      {calendar ? (
        <span className="text-xs text-muted-foreground">{calendar.name}</span>
      ) : null}
      {event.location ? (
        <span className="text-xs text-muted-foreground">{event.location}</span>
      ) : null}
      {event.attendees.length > 0 ? (
        <div className="mt-0.5 flex -space-x-2">
          {event.attendees.slice(0, 5).map((attendee) => {
            const member = getMember(attendee.memberId)
            if (!member) return null
            return (
              <span key={attendee.memberId} className="relative">
                <Avatar size="sm">
                  <AvatarFallback className="text-[0.6rem]">
                    {member.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute -end-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-background",
                    RESPONSE_DOT[attendee.response]
                  )}
                />
              </span>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
