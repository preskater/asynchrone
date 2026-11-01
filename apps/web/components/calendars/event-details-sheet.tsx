"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  BellIcon,
  CalendarIcon,
  ClockIcon,
  KeyRoundIcon,
  MapPinIcon,
  PencilIcon,
  Trash2Icon,
  UsersIcon,
  VideoIcon,
} from "lucide-react"

import { EventDialog } from "@/components/calendars/event-dialog"
import { MemberAvatar } from "@/components/task/member-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { cn } from "@workspace/ui/lib/utils"

import {
  formatDayLabel,
  formatEventRange,
} from "@workspace/calendars/date-utils"
import {
  EVENT_COLOR_CLASSES,
  RESPONSE_VARIANT,
} from "@/lib/calendars/event-colors"
import { useEnumLabel } from "@workspace/i18n/labels"
import { useCalendars } from "@/lib/calendars/store"
import type { CalendarEvent } from "@workspace/calendars/types"

const REMINDER_KEY: Record<number, string> = {
  0: "at_start",
  5: "m5",
  15: "m15",
  30: "m30",
  60: "h1",
}

function DetailRow({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function EventDetailsSheet({
  event,
  open,
  onOpenChange,
  onDeleted,
}: {
  event?: CalendarEvent
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const locale = useLocale()
  const t = useTranslations("Calendars")
  const tc = useTranslations("Common")
  const L = useEnumLabel()
  const { getCalendar, getMember, deleteEvent, setAttendeeResponse } =
    useCalendars()

  if (!event) return null
  const calendar = getCalendar(event.calendarId)
  const styles = EVENT_COLOR_CLASSES[event.color]
  const start = new Date(event.startAt)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className={cn("size-2.5 rounded-full", styles.dot)}
            />
            <SheetTitle className="truncate">{event.title}</SheetTitle>
          </div>
          <SheetDescription>
            {calendar ? calendar.name : t("calendarEvent")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            <DetailRow icon={CalendarIcon}>
              {formatDayLabel(start, locale, tc)}
            </DetailRow>
            <DetailRow icon={ClockIcon}>
              {formatEventRange(event, locale, tc("allDay"))}
            </DetailRow>
            {event.location ? (
              <DetailRow icon={MapPinIcon}>{event.location}</DetailRow>
            ) : null}
            {event.meetingUrl ? (
              <DetailRow icon={VideoIcon}>
                <a
                  href={event.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {t("joinOnline")}
                </a>
              </DetailRow>
            ) : null}
            {event.meetingPassword ? (
              <DetailRow icon={KeyRoundIcon}>
                {t("meetingPasswordLabel", {
                  password: event.meetingPassword,
                })}
              </DetailRow>
            ) : null}
            {event.reminderMinutes !== undefined ? (
              <DetailRow icon={BellIcon}>
                {REMINDER_KEY[event.reminderMinutes]
                  ? L.reminder(REMINDER_KEY[event.reminderMinutes] as string)
                  : t("minutesBefore", { count: event.reminderMinutes })}
              </DetailRow>
            ) : null}
          </div>

          {event.description ? (
            <>
              <Separator />
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {event.description}
              </p>
            </>
          ) : null}

          {event.attendees.length > 0 ? (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <UsersIcon className="size-4 text-muted-foreground" />
                  {t("attendees")}
                  <span className="text-muted-foreground">
                    ({event.attendees.length})
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  {event.attendees.map((attendee) => {
                    const member = getMember(attendee.memberId)
                    if (!member) return null
                    return (
                      <div
                        key={attendee.memberId}
                        className="flex items-center gap-3 rounded-lg px-1 py-1"
                      >
                        <MemberAvatar member={member} size="sm" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm">
                            {member.name}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {member.email}
                          </span>
                        </div>
                        <Badge variant={RESPONSE_VARIANT[attendee.response]}>
                          {L.response(attendee.response)}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
                <Separator />
                <div className="flex flex-wrap gap-2">
                  {(["accepted", "tentative", "declined"] as const).map(
                    (response) => (
                      <Button
                        key={response}
                        variant="outline"
                        size="sm"
                        onClick={() => setAttendeeResponse(event.id, response)}
                      >
                        {response === "accepted"
                          ? t("accept")
                          : response === "tentative"
                            ? t("tentative")
                            : t("decline")}
                      </Button>
                    )
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t p-4">
          <EventDialog
            event={event}
            trigger={
              <Button variant="outline" size="sm">
                <PencilIcon data-icon="inline-start" />
                {t("edit")}
              </Button>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  <Trash2Icon data-icon="inline-start" />
                  {t("delete")}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteEventQuestion")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteEventDescription", { title: event.title })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    deleteEvent(event.id)
                    onOpenChange(false)
                    onDeleted?.()
                  }}
                >
                  {t("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SheetContent>
    </Sheet>
  )
}
