"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { CalendarPlusIcon } from "lucide-react"

import {
  AttendeePicker,
  type AttendeeDraft,
} from "@/components/calendars/attendee-picker"
import { DatePicker } from "@/components/task/date-picker"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { EVENT_COLOR_VAR } from "@/lib/calendars/event-colors"
import { useCalendars, type EventInput } from "@/lib/calendars/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import type { CalendarEvent, EventColor } from "@workspace/calendars/types"

const EVENT_COLOR_VALUES = ["blue", "green", "orange", "red", "purple"] as const

const REMINDER_VALUES = ["none", "0", "5", "15", "30", "60"] as const

const REMINDER_KEY: Record<string, string> = {
  none: "none",
  "0": "at_start",
  "5": "m5",
  "15": "m15",
  "30": "m30",
  "60": "h1",
}

const MINUTES = [0, 15, 30, 45].map((minute) => ({
  label: `:${minute.toString().padStart(2, "0")}`,
  value: String(minute),
}))

function splitTime(value: string) {
  const date = new Date(value)
  return { hour: String(date.getHours()), minute: String(date.getMinutes()) }
}

export function EventDialog({
  trigger,
  event,
  defaultStart,
  defaultEnd,
  defaultCalendarId,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: React.ReactElement
  event?: CalendarEvent
  defaultStart?: Date
  defaultEnd?: Date
  defaultCalendarId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const locale = useLocale()
  const t = useTranslations("Calendars")
  const L = useEnumLabel()
  const { calendars, createEvent, updateEvent, currentUserId } = useCalendars()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  const [title, setTitle] = React.useState("")
  const [calendarId, setCalendarId] = React.useState("")
  const [date, setDate] = React.useState<string | undefined>()
  const [startHour, setStartHour] = React.useState("9")
  const [startMinute, setStartMinute] = React.useState("0")
  const [endHour, setEndHour] = React.useState("10")
  const [endMinute, setEndMinute] = React.useState("0")
  const [allDay, setAllDay] = React.useState(false)
  const [description, setDescription] = React.useState("")
  const [location, setLocation] = React.useState("")
  const [meetingUrl, setMeetingUrl] = React.useState("")
  const [color, setColor] = React.useState<EventColor>("blue")
  const [reminder, setReminder] = React.useState("15")
  const [attendees, setAttendees] = React.useState<AttendeeDraft[]>([])
  const [submitted, setSubmitted] = React.useState(false)

  const titleInvalid = submitted && !title.trim()
  const dateInvalid = submitted && !date
  const calendarInvalid = submitted && !calendarId

  function reset() {
    setSubmitted(false)
    const start = event?.startAt
      ? new Date(event.startAt)
      : (defaultStart ?? new Date())
    const end = event?.endAt
      ? new Date(event.endAt)
      : (defaultEnd ?? new Date(start.getTime() + 60 * 60 * 1000))
    const startParts = splitTime(start.toISOString())
    const endParts = splitTime(end.toISOString())
    setTitle(event?.title ?? "")
    setCalendarId(
      event?.calendarId ?? defaultCalendarId ?? calendars[0]?.id ?? ""
    )
    setDate(start.toISOString())
    setStartHour(startParts.hour)
    setStartMinute(startParts.minute)
    setEndHour(endParts.hour)
    setEndMinute(endParts.minute)
    setAllDay(event?.allDay ?? false)
    setDescription(event?.description ?? "")
    setLocation(event?.location ?? "")
    setMeetingUrl(event?.meetingUrl ?? "")
    setColor(event?.color ?? "blue")
    setReminder(
      event?.reminderMinutes !== undefined
        ? String(event.reminderMinutes)
        : "15"
    )
    setAttendees(
      event?.attendees.map((attendee) => ({
        memberId: attendee.memberId,
        response: attendee.response,
      })) ?? [{ memberId: currentUserId, response: "accepted" }]
    )
  }

  const calendarItems = calendars.map((calendar) => ({
    label: calendar.name,
    value: calendar.id,
  }))

  const hourItems = Array.from({ length: 24 }).map((_, hour) => ({
    label: new Date(2026, 0, 1, hour).toLocaleTimeString(locale, {
      hour: "numeric",
    }),
    value: String(hour),
  }))

  const reminderItems = REMINDER_VALUES.map((value) => ({
    label: L.reminder(REMINDER_KEY[value] as string),
    value,
  }))

  const colorItems = EVENT_COLOR_VALUES.map((value) => ({
    label: L.eventColor(value),
    value,
  }))

  function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setSubmitted(true)
    if (!title.trim() || !date || !calendarId) return
    const start = new Date(date)
    const end = new Date(date)
    if (allDay) {
      start.setHours(0, 0, 0, 0)
      end.setHours(23, 59, 59, 999)
    } else {
      start.setHours(Number(startHour), Number(startMinute), 0, 0)
      end.setHours(Number(endHour), Number(endMinute), 0, 0)
      if (end <= start) end.setDate(end.getDate() + 1)
    }
    const input: EventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      allDay,
      calendarId,
      location: location.trim() || undefined,
      meetingUrl: meetingUrl.trim() || undefined,
      attendees,
      color,
      reminderMinutes: reminder === "none" ? undefined : Number(reminder),
    }
    if (event) updateEvent(event.id, input)
    else createEvent(input)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{event ? t("editEvent") : t("createEvent")}</DialogTitle>
          <DialogDescription>{t("eventDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={titleInvalid}>
              <FieldLabel htmlFor="event-title">{t("title")}</FieldLabel>
              <Input
                id="event-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                aria-invalid={titleInvalid}
                autoFocus
              />
              {titleInvalid ? (
                <FieldError>{t("titleRequired")}</FieldError>
              ) : null}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={calendarInvalid}>
                <FieldLabel htmlFor="event-calendar">
                  {t("calendar")}
                </FieldLabel>
                <Select
                  items={calendarItems}
                  value={calendarId}
                  onValueChange={(value) => setCalendarId(value as string)}
                >
                  <SelectTrigger
                    id="event-calendar"
                    className="w-full"
                    aria-invalid={calendarInvalid}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {calendarItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {calendarInvalid ? (
                  <FieldError>{t("calendarRequired")}</FieldError>
                ) : null}
              </Field>
              <Field data-invalid={dateInvalid}>
                <FieldLabel htmlFor="event-date">{t("date")}</FieldLabel>
                <DatePicker value={date} onChange={setDate} />
                {dateInvalid ? (
                  <FieldError>{t("dateRequired")}</FieldError>
                ) : null}
              </Field>
            </div>

            <Field orientation="horizontal">
              <Checkbox
                id="event-allday"
                checked={allDay}
                onCheckedChange={(checked) => setAllDay(checked === true)}
              />
              <FieldLabel htmlFor="event-allday" className="font-normal">
                {t("allDay")}
              </FieldLabel>
            </Field>

            {!allDay ? (
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel>{t("start")}</FieldLabel>
                  <div className="flex gap-2">
                    <Select
                      items={hourItems}
                      value={startHour}
                      onValueChange={(value) => setStartHour(value as string)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {hourItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Select
                      items={MINUTES}
                      value={startMinute}
                      onValueChange={(value) => setStartMinute(value as string)}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {MINUTES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </Field>
                <Field>
                  <FieldLabel>{t("end")}</FieldLabel>
                  <div className="flex gap-2">
                    <Select
                      items={hourItems}
                      value={endHour}
                      onValueChange={(value) => setEndHour(value as string)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {hourItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Select
                      items={MINUTES}
                      value={endMinute}
                      onValueChange={(value) => setEndMinute(value as string)}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {MINUTES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </Field>
              </div>
            ) : null}

            <Field>
              <FieldLabel>{t("attendees")}</FieldLabel>
              <AttendeePicker value={attendees} onChange={setAttendees} />
            </Field>

            <Field>
              <FieldLabel htmlFor="event-location">{t("location")}</FieldLabel>
              <Input
                id="event-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("locationPlaceholder")}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="event-meeting">{t("meetingUrl")}</FieldLabel>
              <Input
                id="event-meeting"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder={t("meetingUrlPlaceholder")}
              />
              <FieldDescription>{t("meetingUrlHint")}</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="event-description">
                {t("description")}
              </FieldLabel>
              <Textarea
                id="event-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("color")}</FieldLabel>
                <ToggleGroup
                  value={[color]}
                  onValueChange={(value) => {
                    if (value[0]) setColor(value[0] as EventColor)
                  }}
                  spacing={2}
                >
                  {colorItems.map((item) => (
                    <ToggleGroupItem
                      key={item.value}
                      value={item.value}
                      variant="outline"
                      size="default"
                      aria-label={item.label}
                    >
                      <span
                        aria-hidden
                        className="size-3 rounded-full"
                        style={{
                          backgroundColor: EVENT_COLOR_VAR[item.value],
                        }}
                      />
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel htmlFor="event-reminder">
                  {t("reminder")}
                </FieldLabel>
                <Select
                  items={reminderItems}
                  value={reminder}
                  onValueChange={(value) => setReminder(value as string)}
                >
                  <SelectTrigger id="event-reminder" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {reminderItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">
              <CalendarPlusIcon data-icon="inline-start" />
              {event ? t("save") : t("createEvent")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
