"use client"

import * as React from "react"
import { CalendarPlusIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
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

import { formatTime } from "@workspace/messaging/format"
import { useMessaging } from "@workspace/messaging/store"

const DURATION_MINUTES = [15, 30, 45, 60]

function buildTimes(locale: string) {
  return Array.from({ length: 11 }).map((_, index) => {
    const hour = 8 + index
    const date = new Date()
    date.setHours(hour, 0, 0, 0)
    return { label: formatTime(date, locale), value: String(hour) }
  })
}

export function MeetingDialog({
  conversationId,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  conversationId: string
  trigger: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("Meetings")
  const locale = useLocale()
  const { sendMessage } = useMessaging()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [title, setTitle] = React.useState(() => t("defaultTitle"))
  const [date, setDate] = React.useState<string | undefined>(
    new Date().toISOString()
  )
  const [hour, setHour] = React.useState("15")
  const [duration, setDuration] = React.useState("30")

  const durations = DURATION_MINUTES.map((minutes) => ({
    label: minutes >= 60 ? t("oneHour") : t("minutesCount", { count: minutes }),
    value: String(minutes),
  }))
  const times = buildTimes(locale)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!title.trim() || !date) return
            const startsAt = new Date(date)
            startsAt.setHours(Number(hour), 0, 0, 0)
            sendMessage({
              conversationId,
              body: "",
              meeting: {
                title: title.trim(),
                startsAt: startsAt.toISOString(),
                durationMinutes: Number(duration),
              },
            })
            setOpen(false)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="meeting-title">{t("titleLabel")}</FieldLabel>
              <Input
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="meeting-date">{t("date")}</FieldLabel>
              <Input
                id="meeting-date"
                type="date"
                value={date?.slice(0, 10)}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="meeting-time">{t("startTime")}</FieldLabel>
                <Select
                  items={times}
                  value={hour}
                  onValueChange={(value) => setHour(value as string)}
                >
                  <SelectTrigger id="meeting-time" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {times.map((time) => (
                        <SelectItem key={time.value} value={time.value}>
                          {time.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="meeting-duration">
                  {t("duration")}
                </FieldLabel>
                <Select
                  items={durations}
                  value={duration}
                  onValueChange={(value) => setDuration(value as string)}
                >
                  <SelectTrigger id="meeting-duration" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {durations.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <FieldDescription>{t("everyoneInvited")}</FieldDescription>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">
              <CalendarPlusIcon data-icon="inline-start" />
              {t("schedule")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
