"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  CalendarPlusIcon,
  MapPinIcon,
  PlusIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react"
import { toast } from "sonner"

import { DatePicker } from "@workspace/projects/components/task/date-picker"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { unwrapActionResult } from "@workspace/core/action"
import { useRouter } from "@workspace/i18n/navigation"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import {
  MAX_PROPOSED_SLOTS,
  MEETING_DURATIONS,
  MIN_MEETING_MINUTES,
  MIN_PROPOSED_SLOTS,
  type MeetingMode,
  type MeetingRequestData,
  type MeetingStatus,
  type PortalMeetingsData,
} from "@workspace/meetings/types"

import { usePortalActions } from "./actions"

const STATUS_VARIANT: Record<
  MeetingStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  accepted: "default",
  declined: "destructive",
  cancelled: "outline",
}

interface DraftSlot {
  key: string
  date?: string
  time: string
}

function newSlot(time = "09:00"): DraftSlot {
  return {
    key: `slot_${Math.random().toString(36).slice(2, 9)}`,
    time,
  }
}

export function PortalMeetings({ data }: { data: PortalMeetingsData }) {
  const t = useTranslations("MeetingRequests")
  const L = useEnumLabel()
  const te = useErrorTranslator()
  const locale = useLocale()
  const router = useRouter()
  const actions = usePortalActions()
  const { settings, requests } = data

  const [cancelId, setCancelId] = React.useState<string>()
  const [cancelling, setCancelling] = React.useState(false)

  function formatWhen(startAt: string, endAt: string) {
    const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(startAt)
    )
    const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" })
    return `${day} · ${time.format(new Date(startAt))} – ${time.format(new Date(endAt))}`
  }

  async function handleCancel() {
    if (!cancelId) return
    setCancelling(true)
    try {
      unwrapActionResult(
        await actions.cancelMeetingRequestAction({ id: cancelId })
      )
      toast.success(t("requestCancelled"))
      setCancelId(undefined)
      router.refresh()
    } catch (error) {
      toast.error(te(error))
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("portalDescription")}
          </p>
        </div>
        {settings.clientRequestsEnabled ? (
          <RequestMeetingDialog settings={settings} />
        ) : null}
      </div>

      {!settings.clientRequestsEnabled ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("disabledTitle")}</CardTitle>
            <CardDescription>{t("disabledDescription")}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("requestsTitle")}
        </h2>
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("empty")}
            </CardContent>
          </Card>
        ) : (
          requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              formatWhen={formatWhen}
              onCancel={() => setCancelId(request.id)}
            />
          ))
        )}
      </section>

      <Dialog
        open={cancelId !== undefined}
        onOpenChange={(open) => {
          if (!open) setCancelId(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelRequestTitle")}</DialogTitle>
            <DialogDescription>
              {t("cancelRequestDescription", {
                title:
                  requests.find((request) => request.id === cancelId)?.title ??
                  "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button
              variant="destructive"
              type="button"
              disabled={cancelling}
              onClick={() => void handleCancel()}
            >
              {t("cancelRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RequestCard({
  request,
  formatWhen,
  onCancel,
}: {
  request: MeetingRequestData
  formatWhen: (startAt: string, endAt: string) => string
  onCancel: () => void
}) {
  const t = useTranslations("MeetingRequests")
  const L = useEnumLabel()

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-base">{request.title}</CardTitle>
          </div>
          <Badge variant={STATUS_VARIANT[request.status]}>
            {L.meetingStatus(request.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("proposedTimes")}
          </span>
          <ul className="flex flex-col gap-1">
            {request.slots.map((slot) => (
              <li
                key={slot.id}
                className="flex flex-wrap items-center gap-2 text-muted-foreground"
              >
                <span
                  className={
                    slot.selected ? "font-medium text-foreground" : undefined
                  }
                >
                  {formatWhen(slot.startAt, slot.endAt)}
                </span>
                {slot.selected ? <Badge>{t("confirmed")}</Badge> : null}
                {!slot.selected &&
                request.status === "pending" &&
                slot.hasConflict ? (
                  <Badge variant="outline">{t("unavailable")}</Badge>
                ) : null}
                {!slot.selected && request.status === "accepted" ? (
                  <Badge variant="outline">{t("notSelected")}</Badge>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          {request.mode === "online" ? (
            <VideoIcon className="size-4" />
          ) : (
            <MapPinIcon className="size-4" />
          )}
          <span>{L.meetingMode(request.mode)}</span>
          {request.mode === "online" && request.meetingUrl ? (
            <a
              href={request.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {t("join")}
            </a>
          ) : null}
          {request.mode === "in_person" && request.address ? (
            <span className="truncate">{request.address}</span>
          ) : null}
          {request.mode === "online" && request.meetingPassword ? (
            <span>
              {t("meetingPasswordValue", {
                password: request.meetingPassword,
              })}
            </span>
          ) : null}
        </div>
        {request.description ? (
          <p className="text-muted-foreground">{request.description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("requestedBy", { name: request.requestedByName })}
        </p>
        {request.decidedByName ? (
          <p className="text-xs text-muted-foreground">
            {t("answeredBy", { name: request.decidedByName })}
          </p>
        ) : null}
        {request.decisionNote ? (
          <p className="text-xs">
            {t("decisionNote", { note: request.decisionNote })}
          </p>
        ) : null}
      </CardContent>
      {request.status === "pending" ? (
        <CardFooter>
          <Button variant="outline" size="sm" onClick={onCancel}>
            {t("cancelRequest")}
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function RequestMeetingDialog({
  settings,
}: {
  settings: PortalMeetingsData["settings"]
}) {
  const t = useTranslations("MeetingRequests")
  const te = useErrorTranslator()
  const router = useRouter()
  const actions = usePortalActions()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [duration, setDuration] = React.useState(
    String(settings.defaultDurationMinutes)
  )
  const [slots, setSlots] = React.useState<DraftSlot[]>([
    newSlot("09:00"),
    newSlot("14:00"),
  ])
  const [mode, setMode] = React.useState<MeetingMode>("online")
  const [meetingUrl, setMeetingUrl] = React.useState("")
  const [meetingPassword, setMeetingPassword] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const durations = React.useMemo(() => {
    const values = new Set<number>([
      ...MEETING_DURATIONS.filter(
        (value) => value <= settings.maxDurationMinutes
      ),
      settings.defaultDurationMinutes,
    ])
    return [...values].sort((a, b) => a - b)
  }, [settings.defaultDurationMinutes, settings.maxDurationMinutes])

  const titleInvalid = submitted && !title.trim()
  const dateInvalid = submitted && slots.some((slot) => !slot.date)
  const urlInvalid =
    submitted &&
    mode === "online" &&
    settings.requiresMeetingUrl &&
    !meetingUrl.trim()
  const addressInvalid = submitted && mode === "in_person" && !address.trim()

  function reset() {
    setSubmitted(false)
    setTitle("")
    setDescription("")
    setDuration(String(settings.defaultDurationMinutes))
    setSlots([newSlot("09:00"), newSlot("14:00")])
    setMode("online")
    setMeetingUrl("")
    setMeetingPassword("")
    setAddress("")
  }

  function updateSlot(key: string, patch: Partial<DraftSlot>) {
    setSlots((previous) =>
      previous.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot))
    )
  }

  const durationItems = durations.map((value) => ({
    label: t("minutesCount", { count: value }),
    value: String(value),
  }))

  function slotStart(slot: DraftSlot): Date | undefined {
    if (!slot.date) return undefined
    const start = new Date(slot.date)
    const [hours, minutes] = slot.time.split(":").map(Number)
    start.setHours(hours ?? 9, minutes ?? 0, 0, 0)
    return start
  }

  async function handleSubmit(formEvent: React.FormEvent) {
    formEvent.preventDefault()
    setSubmitted(true)
    if (!title.trim()) return
    if (slots.some((slot) => !slot.date)) return
    if (mode === "online" && settings.requiresMeetingUrl && !meetingUrl.trim())
      return
    if (mode === "in_person" && !address.trim()) return

    const durationMinutes = Number(duration)
    if (durationMinutes < MIN_MEETING_MINUTES) {
      toast.error(
        t("invalidDuration", {
          min: MIN_MEETING_MINUTES,
          max: settings.maxDurationMinutes,
        })
      )
      return
    }

    const starts = slots
      .map((slot) => slotStart(slot))
      .filter((start): start is Date => start !== undefined)
    const unique = new Set(starts.map((start) => start.toISOString()))
    if (unique.size !== starts.length) {
      toast.error(t("duplicateTimes"))
      return
    }

    setSaving(true)
    try {
      unwrapActionResult(
        await actions.createMeetingRequestAction({
          title: title.trim(),
          description: description.trim() || undefined,
          durationMinutes,
          slots: starts.map((start) => ({ startAt: start.toISOString() })),
          mode,
          meetingUrl:
            mode === "online" ? meetingUrl.trim() || undefined : undefined,
          meetingPassword:
            mode === "online" ? meetingPassword.trim() || undefined : undefined,
          address:
            mode === "in_person" ? address.trim() || undefined : undefined,
        })
      )
      toast.success(t("requestSent"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <CalendarPlusIcon data-icon="inline-start" />
            {t("requestMeeting")}
          </Button>
        }
      />
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("formTitle")}</DialogTitle>
          <DialogDescription>{t("formDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field data-invalid={titleInvalid}>
              <FieldLabel htmlFor="meeting-title">{t("titleLabel")}</FieldLabel>
              <Input
                id="meeting-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("titlePlaceholder")}
                aria-invalid={titleInvalid}
                aria-describedby={
                  titleInvalid ? "meeting-title-error" : undefined
                }
                autoFocus
              />
              {titleInvalid ? (
                <FieldError id="meeting-title-error">
                  {t("requiredTitle")}
                </FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="meeting-details">
                {t("detailsLabel")}
              </FieldLabel>
              <Textarea
                id="meeting-details"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("detailsPlaceholder")}
              />
            </Field>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <FieldLabel>{t("proposedTimes")}</FieldLabel>
                  <FieldDescription>
                    {t("slotCountHint", {
                      min: MIN_PROPOSED_SLOTS,
                      max: MAX_PROPOSED_SLOTS,
                    })}
                  </FieldDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSlots((previous) => [...previous, newSlot("11:00")])
                  }
                  disabled={slots.length >= MAX_PROPOSED_SLOTS}
                >
                  <PlusIcon data-icon="inline-start" />
                  {t("addTime")}
                </Button>
              </div>

              <div className="grid grid-cols-[1fr_7rem_2.25rem] items-center gap-2 text-xs text-muted-foreground">
                <span>{t("date")}</span>
                <span>{t("startTime")}</span>
                <span />
              </div>

              {slots.map((slot, index) => (
                <div
                  key={slot.key}
                  className="grid grid-cols-[1fr_7rem_2.25rem] items-center gap-2"
                >
                  <div data-invalid={(submitted && !slot.date) || undefined}>
                    <DatePicker
                      invalid={submitted && !slot.date}
                      aria-describedby={
                        submitted && !slot.date
                          ? "meeting-slots-error"
                          : undefined
                      }
                      value={slot.date}
                      onChange={(value) =>
                        updateSlot(slot.key, { date: value })
                      }
                      placeholder={t("slotDatePlaceholder", {
                        number: index + 1,
                      })}
                    />
                  </div>
                  <Input
                    type="time"
                    value={slot.time}
                    aria-label={t("startTime")}
                    onChange={(event) =>
                      updateSlot(slot.key, { time: event.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("removeTime")}
                    onClick={() =>
                      setSlots((previous) =>
                        previous.filter((entry) => entry.key !== slot.key)
                      )
                    }
                    disabled={slots.length <= MIN_PROPOSED_SLOTS}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              {dateInvalid ? (
                <FieldError id="meeting-slots-error">
                  {t("requiredSlots")}
                </FieldError>
              ) : null}
            </div>

            <Field>
              <FieldLabel htmlFor="meeting-duration">
                {t("duration")}
              </FieldLabel>
              <Select
                items={durationItems}
                value={duration}
                onValueChange={(value) => setDuration(value as string)}
              >
                <SelectTrigger id="meeting-duration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {durationItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>{t("mode")}</FieldLabel>
              <ToggleGroup
                value={[mode]}
                onValueChange={(value) => {
                  if (value[0]) setMode(value[0] as MeetingMode)
                }}
                spacing={2}
              >
                <ToggleGroupItem value="online" variant="outline">
                  <VideoIcon data-icon="inline-start" />
                  {t("online")}
                </ToggleGroupItem>
                <ToggleGroupItem value="in_person" variant="outline">
                  <MapPinIcon data-icon="inline-start" />
                  {t("inPerson")}
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>

            {mode === "online" ? (
              <>
                <Field data-invalid={urlInvalid}>
                  <FieldLabel htmlFor="meeting-url">
                    {t("meetingUrl")}
                  </FieldLabel>
                  <Input
                    id="meeting-url"
                    value={meetingUrl}
                    onChange={(event) => setMeetingUrl(event.target.value)}
                    placeholder={t("meetingUrlPlaceholder")}
                    aria-invalid={urlInvalid}
                    aria-describedby={
                      urlInvalid ? "meeting-url-error" : undefined
                    }
                  />
                  <FieldDescription>{t("meetingUrlHint")}</FieldDescription>
                  {urlInvalid ? (
                    <FieldError id="meeting-url-error">
                      {t("requiredUrl")}
                    </FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor="meeting-password">
                    {t("meetingPassword")}
                  </FieldLabel>
                  <Input
                    id="meeting-password"
                    value={meetingPassword}
                    onChange={(event) => setMeetingPassword(event.target.value)}
                    placeholder={t("meetingPasswordPlaceholder")}
                  />
                </Field>
              </>
            ) : (
              <Field data-invalid={addressInvalid}>
                <FieldLabel htmlFor="meeting-address">
                  {t("address")}
                </FieldLabel>
                <Input
                  id="meeting-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder={t("addressPlaceholder")}
                  aria-invalid={addressInvalid}
                  aria-describedby={
                    addressInvalid ? "meeting-address-error" : undefined
                  }
                />
                {addressInvalid ? (
                  <FieldError id="meeting-address-error">
                    {t("requiredAddress")}
                  </FieldError>
                ) : null}
              </Field>
            )}

            <FieldDescription>
              {t("windowHint", {
                hours: settings.minNoticeHours,
                days: settings.bookingWindowDays,
              })}
            </FieldDescription>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
