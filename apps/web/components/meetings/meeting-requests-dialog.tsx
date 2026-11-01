"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  CalendarCheckIcon,
  MapPinIcon,
  RefreshCwIcon,
  VideoIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  acceptMeetingRequestAction,
  declineMeetingRequestAction,
  listMeetingRequestsAction,
} from "@/actions/meetings"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { unwrapActionResult } from "@workspace/core/action"
import { useRouter } from "@workspace/i18n/navigation"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import type {
  MeetingRequestData,
  MeetingRequestsData,
  MeetingStatus,
} from "@workspace/meetings/types"
import { roleRank } from "@workspace/organization/roles"
import { useOrgPermissions } from "@/lib/organization/use-permissions"

const STATUS_VARIANT: Record<
  MeetingStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  accepted: "default",
  declined: "destructive",
  cancelled: "outline",
}

type Decision = { type: "accept" | "decline"; request: MeetingRequestData }

/** Team inbox of client meeting proposals, opened from the calendar header. */
export function MeetingRequestsDialog() {
  const t = useTranslations("MeetingRequests")
  const L = useEnumLabel()
  const te = useErrorTranslator()
  const locale = useLocale()
  const router = useRouter()
  const permissions = useOrgPermissions()
  const canDecide = roleRank(permissions.role) >= 2

  const [open, setOpen] = React.useState(false)
  const [data, setData] = React.useState<MeetingRequestsData>()
  const [loading, setLoading] = React.useState(false)
  const [decision, setDecision] = React.useState<Decision>()
  const [chosenSlotId, setChosenSlotId] = React.useState<string>()
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setData(unwrapActionResult(await listMeetingRequestsAction()))
    } catch (error) {
      toast.error(te(error))
    } finally {
      setLoading(false)
    }
  }, [te])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  const pendingCount =
    data?.requests.filter((request) => request.status === "pending").length ?? 0

  function formatWhen(startAt: string, endAt: string) {
    const day = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(startAt)
    )
    const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" })
    return `${day} · ${time.format(new Date(startAt))} – ${time.format(new Date(endAt))}`
  }

  function openDecision(type: Decision["type"], request: MeetingRequestData) {
    setNote("")
    if (type === "accept") {
      const autoDecline = data?.settings.autoDeclineOverlaps ?? true
      const firstAvailable =
        request.slots.find((slot) => !autoDecline || !slot.hasConflict) ??
        request.slots[0]
      setChosenSlotId(firstAvailable?.id)
    } else {
      setChosenSlotId(undefined)
    }
    setDecision({ type, request })
  }

  async function submitDecision() {
    if (!decision) return
    if (decision.type === "accept" && !chosenSlotId) {
      toast.error(t("slotRequired"))
      return
    }
    setBusy(true)
    try {
      if (decision.type === "accept") {
        unwrapActionResult(
          await acceptMeetingRequestAction({
            id: decision.request.id,
            slotId: chosenSlotId,
            note: note.trim() || undefined,
          })
        )
        toast.success(t("accepted"))
      } else {
        unwrapActionResult(
          await declineMeetingRequestAction({
            id: decision.request.id,
            note: note.trim() || undefined,
          })
        )
        toast.success(t("declined"))
      }
      setDecision(undefined)
      await load()
      router.refresh()
    } catch (error) {
      toast.error(te(error))
    } finally {
      setBusy(false)
    }
  }

  const autoDecline = data?.settings.autoDeclineOverlaps ?? true

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button variant="outline" size="sm">
              <CalendarCheckIcon data-icon="inline-start" />
              {t("openRequests")}
              {pendingCount > 0 ? (
                <Badge variant="secondary" className="ms-1">
                  {pendingCount}
                </Badge>
              ) : null}
            </Button>
          }
        />
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("teamTitle")}</DialogTitle>
            <DialogDescription>{t("teamDescription")}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t("pendingCount", { count: pendingCount })}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCwIcon data-icon="inline-start" />
              {t("refresh")}
            </Button>
          </div>

          {loading && !data ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : !data || data.requests.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("noRequests")}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.requests.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-3 rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
                        {request.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("slotCount", { count: request.slots.length })}
                      </span>
                    </div>
                    <Badge variant={STATUS_VARIANT[request.status]}>
                      {L.meetingStatus(request.status)}
                    </Badge>
                  </div>

                  <ul className="flex flex-col gap-1 text-sm">
                    {request.slots.map((slot) => (
                      <li
                        key={slot.id}
                        className="flex flex-wrap items-center gap-2 text-muted-foreground"
                      >
                        <span
                          className={
                            slot.selected
                              ? "font-medium text-foreground"
                              : undefined
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

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{request.clientName}</span>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      {request.mode === "online" ? (
                        <VideoIcon className="size-3.5" />
                      ) : (
                        <MapPinIcon className="size-3.5" />
                      )}
                      {L.meetingMode(request.mode)}
                    </span>
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
                      <span>{request.address}</span>
                    ) : null}
                    {request.mode === "online" && request.meetingPassword ? (
                      <span>
                        {t("meetingPasswordValue", {
                          password: request.meetingPassword,
                        })}
                      </span>
                    ) : null}
                    <span aria-hidden>·</span>
                    <span>
                      {t("requestedBy", { name: request.requestedByName })}
                    </span>
                  </div>

                  {request.description ? (
                    <p className="text-sm text-muted-foreground">
                      {request.description}
                    </p>
                  ) : null}

                  {request.decisionNote ? (
                    <p className="text-xs">
                      {t("decisionNote", { note: request.decisionNote })}
                    </p>
                  ) : null}

                  {request.status === "pending" && canDecide ? (
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDecision("decline", request)}
                      >
                        {t("decline")}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openDecision("accept", request)}
                      >
                        {t("accept")}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={decision !== undefined}
        onOpenChange={(next) => {
          if (!next) setDecision(undefined)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.type === "accept"
                ? t("acceptTitle")
                : t("declineTitle")}
            </DialogTitle>
            <DialogDescription>
              {decision?.type === "accept"
                ? t("acceptDescription", { title: decision.request.title })
                : t("declineDescription")}
            </DialogDescription>
          </DialogHeader>

          {decision?.type === "accept" ? (
            <Field>
              <FieldLabel>{t("chooseSlot")}</FieldLabel>
              <div className="flex flex-col gap-2">
                {decision.request.slots.map((slot) => {
                  const disabled = autoDecline && slot.hasConflict
                  return (
                    <label
                      key={slot.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary"
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="meeting-slot"
                          value={slot.id}
                          checked={chosenSlotId === slot.id}
                          onChange={() => setChosenSlotId(slot.id)}
                          disabled={disabled}
                        />
                        {formatWhen(slot.startAt, slot.endAt)}
                      </span>
                      {slot.hasConflict ? (
                        <Badge variant="outline">{t("unavailable")}</Badge>
                      ) : null}
                    </label>
                  )
                })}
              </div>
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="meeting-decision-note">
              {decision?.type === "accept" ? t("acceptNote") : t("declineNote")}
            </FieldLabel>
            <Textarea
              id="meeting-decision-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={
                decision?.type === "accept"
                  ? t("acceptNotePlaceholder")
                  : t("declineNotePlaceholder")
              }
            />
          </Field>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setDecision(undefined)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant={decision?.type === "decline" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void submitDecision()}
            >
              {decision?.type === "accept"
                ? t("confirmAccept")
                : t("confirmDecline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
