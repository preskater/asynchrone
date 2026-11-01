"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArrowRightIcon,
  CalendarIcon,
  HistoryIcon,
  MailIcon,
  PhoneIcon,
  StickyNoteIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { useClientActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  ClientActivityData,
  ClientActivityType,
  ClientTimelineEntryData,
} from "../types"
import { CLIENT_ACTIVITY_TYPES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { toDateTimeLocal, useClientFormat } from "./use-clients"

const ACTIVITY_ICONS: Record<ClientActivityType, React.ReactNode> = {
  note: <StickyNoteIcon className="size-4" />,
  call: <PhoneIcon className="size-4" />,
  email: <MailIcon className="size-4" />,
  meeting: <CalendarIcon className="size-4" />,
}

function SystemEvent({
  action,
  details,
  authorName,
  occurredAt,
}: {
  action: string
  details: Record<string, string>
  authorName: string
  occurredAt: string
}) {
  const t = useTranslations("Clients")
  const { relative } = useClientFormat()
  const [entity, ...rest] = action.split(".")
  const key = `timeline.system.${entity}.${rest.join(".")}`
  let label: string
  try {
    label = t(key as never, details as never)
  } catch {
    label = action
  }
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HistoryIcon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">
          {authorName} · {relative(occurredAt)}
        </p>
      </div>
    </li>
  )
}

function ActivityItem({
  activity,
  occurredAt,
}: {
  activity: ClientActivityData
  occurredAt: string
}) {
  const L = useEnumLabel()
  const { relative } = useClientFormat()
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {ACTIVITY_ICONS[activity.type]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-sm">
          {activity.subject ? (
            <span className="font-medium">{activity.subject}</span>
          ) : (
            <span className="font-medium">
              {L.clientActivityType(activity.type)}
            </span>
          )}
          {activity.subject ? (
            <span className="ml-2 text-xs text-muted-foreground">
              · {L.clientActivityType(activity.type)}
            </span>
          ) : null}
        </p>
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">
          {activity.body}
        </p>
        <p className="text-xs text-muted-foreground">
          {activity.authorName} · {relative(occurredAt)}
        </p>
      </div>
    </li>
  )
}

/** Chronological feed of activities and system events. */
export function ActivityTimeline({
  entries,
  emptyLabel,
  limit = 12,
}: {
  entries: ClientTimelineEntryData[]
  emptyLabel?: string
  limit?: number
}) {
  const t = useTranslations("Clients")
  const [expanded, setExpanded] = React.useState(false)
  const visible = expanded ? entries : entries.slice(0, limit)

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyLabel ?? t("activity.empty")}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y">
        {visible.map((entry) =>
          entry.kind === "system" && entry.system ? (
            <SystemEvent
              key={entry.id}
              action={entry.system.action}
              details={entry.system.details}
              authorName={entry.system.authorName}
              occurredAt={entry.occurredAt}
            />
          ) : entry.activity ? (
            <ActivityItem
              key={entry.id}
              activity={entry.activity}
              occurredAt={entry.occurredAt}
            />
          ) : null
        )}
      </ul>
      {!expanded && entries.length > limit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => setExpanded(true)}
        >
          {t("activity.showMore")}
        </Button>
      ) : null}
    </div>
  )
}

/** Dialog to log a note, call, email or meeting on one or more records. */
export function ActivityDialog({
  clientId,
  contactId,
  dealId,
  trigger,
}: {
  clientId?: string
  contactId?: string
  dealId?: string
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()
  const { createActivityAction } = useClientActions()

  const [open, setOpen] = React.useState(false)
  const [type, setType] = React.useState<ClientActivityType>("note")
  const [subject, setSubject] = React.useState("")
  const [body, setBody] = React.useState("")
  const [when, setWhen] = React.useState(toDateTimeLocal())
  const [submitting, setSubmitting] = React.useState(false)

  function reset() {
    setType("note")
    setSubject("")
    setBody("")
    setWhen(toDateTimeLocal())
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    try {
      const parsed = new Date(when)
      unwrapActionResult(
        await createActivityAction({
          type,
          subject: subject.trim() === "" ? null : subject.trim(),
          body: body.trim(),
          occurredAt: Number.isNaN(parsed.getTime())
            ? null
            : parsed.toISOString(),
          clientId: clientId ?? null,
          contactId: contactId ?? null,
          dealId: dealId ?? null,
        })
      )
      toast.success(tT("activityLogged"))
      setOpen(false)
      reset()
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  const typeItems = CLIENT_ACTIVITY_TYPES.map((value) => ({
    value,
    label: L.clientActivityType(value),
  }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("activity.add")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="client-activity-type">
                  {t("activity.type")}
                </FieldLabel>
                <Select
                  items={typeItems}
                  value={type}
                  onValueChange={(value) =>
                    setType(value as ClientActivityType)
                  }
                >
                  <SelectTrigger id="client-activity-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {typeItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="client-activity-when">
                  {t("activity.when")}
                </FieldLabel>
                <Input
                  id="client-activity-when"
                  type="datetime-local"
                  value={when}
                  onChange={(event) => setWhen(event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="client-activity-subject">
                {t("activity.subject")}
              </FieldLabel>
              <Input
                id="client-activity-subject"
                value={subject}
                maxLength={160}
                placeholder={t("activity.subjectPlaceholder")}
                onChange={(event) => setSubject(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="client-activity-body">
                {t("activity.body")}
              </FieldLabel>
              <Textarea
                id="client-activity-body"
                value={body}
                required
                maxLength={4000}
                rows={4}
                placeholder={t("activity.bodyPlaceholder")}
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting || !body.trim()}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Compact card listing the latest activities across the client. */
export function RecentActivityCard({
  entries,
}: {
  entries: ClientTimelineEntryData[]
}) {
  const t = useTranslations("Clients")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowRightIcon className="size-4 text-muted-foreground" />
          {t("activity.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ActivityTimeline entries={entries} limit={6} />
      </CardContent>
    </Card>
  )
}
