"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

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
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { useEmployeeActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import { formatDateKey } from "../date-utils"
import type {
  BalanceType,
  DayPeriod,
  EmployeeMemberData,
  EmployeeOverviewData,
  LeaveRequestData,
  LeaveType,
} from "../types"
import { BALANCE_TYPES, LEAVE_TYPES, TRACKED_LEAVE_TYPES } from "../types"
import { halfKeysBetween } from "../utils"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { EmployeeDatePicker } from "./employee-date-picker"

export function RequestLeaveDialog({
  data,
  trigger,
}: {
  data: EmployeeOverviewData
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { createLeaveAction } = useEmployeeActions()
  const tV = useTranslations("Errors.validationMessages")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [requesterId, setRequesterId] = React.useState(data.currentUserId)
  const [type, setType] = React.useState<LeaveType>("paid_leave")
  const [startDate, setStartDate] = React.useState("")
  const [endDate, setEndDate] = React.useState("")
  const [startPeriod, setStartPeriod] = React.useState<DayPeriod>("morning")
  const [endPeriod, setEndPeriod] = React.useState<DayPeriod>("afternoon")
  const [comment, setComment] = React.useState("")
  const [submitted, setSubmitted] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const activeMembers = data.members.filter((member) => member.profile.isActive)
  const halfDays =
    startDate && endDate && endDate >= startDate
      ? halfKeysBetween(startDate, startPeriod, endDate, endPeriod).length
      : 0

  const startInvalid = submitted && !startDate
  const endMissing = submitted && !endDate
  const endBeforeStart = submitted && !!endDate && endDate < startDate
  const noWorkingHalves =
    submitted &&
    !startInvalid &&
    !endMissing &&
    !endBeforeStart &&
    halfDays <= 0

  const typeItems = LEAVE_TYPES.map((value) => ({
    value,
    label: L.leaveType(value),
  }))
  const memberItems = activeMembers.map((member) => ({
    value: member.id,
    label:
      member.id === data.currentUserId
        ? t("leave.me", { name: member.name })
        : member.name,
  }))
  const periodItems = [
    { value: "morning", label: t("leave.morning") },
    { value: "afternoon", label: t("leave.afternoon") },
  ]

  function reset() {
    setRequesterId(data.currentUserId)
    setType("paid_leave")
    setStartDate("")
    setEndDate("")
    setStartPeriod("morning")
    setEndPeriod("afternoon")
    setComment("")
    setSubmitted(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    if (!startDate || !endDate || endDate < startDate || halfDays <= 0) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await createLeaveAction({
          userId:
            data.access.isAdmin && requesterId !== data.currentUserId
              ? requesterId
              : undefined,
          type,
          startDate,
          endDate,
          startPeriod,
          endPeriod,
          comment: comment.trim() || undefined,
        })
      )
      toast.success(tT("leaveRequested"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesLeaveFailed"))
    } finally {
      setSubmitting(false)
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
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("leave.requestTitle")}</DialogTitle>
          <DialogDescription>{t("leave.requestDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            {data.access.isAdmin ? (
              <Field>
                <FieldLabel htmlFor="leave-requester">
                  {t("leave.requester")}
                </FieldLabel>
                <Select
                  items={memberItems}
                  value={requesterId}
                  onValueChange={(value) => setRequesterId(value as string)}
                >
                  <SelectTrigger id="leave-requester" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {memberItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="leave-type">{t("leave.type")}</FieldLabel>
              <Select
                items={typeItems}
                value={type}
                onValueChange={(value) => setType(value as LeaveType)}
              >
                <SelectTrigger id="leave-type" className="w-full">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={startInvalid}>
                <FieldLabel htmlFor="leave-start">
                  {t("leave.startDate")}
                </FieldLabel>
                <EmployeeDatePicker
                  id="leave-start"
                  value={startDate || undefined}
                  onChange={setStartDate}
                  placeholder={t("leave.pickStart")}
                  invalid={startInvalid}
                  aria-describedby={
                    startInvalid ? "leave-start-error" : undefined
                  }
                />
                {startInvalid ? (
                  <FieldError id="leave-start-error">
                    {tV("required")}
                  </FieldError>
                ) : null}
              </Field>
              <Field
                data-invalid={endMissing || endBeforeStart || noWorkingHalves}
              >
                <FieldLabel htmlFor="leave-end">
                  {t("leave.endDate")}
                </FieldLabel>
                <EmployeeDatePicker
                  id="leave-end"
                  value={endDate || undefined}
                  onChange={setEndDate}
                  placeholder={t("leave.pickEnd")}
                  disabledBefore={startDate || undefined}
                  invalid={endMissing || endBeforeStart || noWorkingHalves}
                  aria-describedby={
                    endMissing || endBeforeStart || noWorkingHalves
                      ? "leave-end-error"
                      : undefined
                  }
                />
                {endMissing || endBeforeStart || noWorkingHalves ? (
                  <FieldError id="leave-end-error">
                    {endMissing ? <p>{tV("required")}</p> : null}
                    {endBeforeStart ? <p>{t("leave.endBeforeStart")}</p> : null}
                    {noWorkingHalves ? (
                      <p>{t("leave.noWorkingHalves")}</p>
                    ) : null}
                  </FieldError>
                ) : null}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="leave-start-period">
                  {t("leave.startHalf")}
                </FieldLabel>
                <Select
                  items={periodItems}
                  value={startPeriod}
                  onValueChange={(value) => setStartPeriod(value as DayPeriod)}
                >
                  <SelectTrigger id="leave-start-period" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {periodItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="leave-end-period">
                  {t("leave.endHalf")}
                </FieldLabel>
                <Select
                  items={periodItems}
                  value={endPeriod}
                  onValueChange={(value) => setEndPeriod(value as DayPeriod)}
                >
                  <SelectTrigger id="leave-end-period" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {periodItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {halfDays > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("leave.halfDaysCount", { count: halfDays })}
                {startDate && endDate ? (
                  <>
                    {" · "}
                    {formatDateKey(startDate, locale)} –{" "}
                    {formatDateKey(endDate, locale)}
                  </>
                ) : null}
              </p>
            ) : null}

            <Field>
              <FieldLabel htmlFor="leave-comment">
                {t("leave.comment")}
              </FieldLabel>
              <Textarea
                id="leave-comment"
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("leave.commentPlaceholder")}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("leave.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function DecideLeaveDialog({
  request,
  currentUserId,
  trigger,
}: {
  request: LeaveRequestData
  currentUserId: string
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { decideLeaveAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [comment, setComment] = React.useState("")
  const [pending, setPending] = React.useState<"approved" | "rejected" | null>(
    null
  )

  const isOwn = request.userId === currentUserId

  async function decide(decision: "approved" | "rejected") {
    setPending(decision)
    try {
      unwrapActionResult(
        await decideLeaveAction(request.id, {
          decision,
          comment: comment.trim() || undefined,
        })
      )
      toast.success(
        decision === "approved" ? tT("leaveApproved") : tT("leaveRejected")
      )
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesDecideFailed"))
    } finally {
      setPending(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setComment("")
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leave.decideTitle")}</DialogTitle>
          <DialogDescription>
            {request.userName} · {L.leaveType(request.type)} ·{" "}
            {formatDateKey(request.startDate, locale)} –{" "}
            {formatDateKey(request.endDate, locale)} ·{" "}
            {t("leave.halfDaysCount", { count: request.halfDays })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {request.comment ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              {request.comment}
            </p>
          ) : null}
          {isOwn ? (
            <p className="text-sm text-muted-foreground">
              {t("leave.selfDecisionHint")}
            </p>
          ) : (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="decide-comment">
                  {t("leave.decisionComment")}
                </FieldLabel>
                <Textarea
                  id="decide-comment"
                  rows={2}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("leave.decisionCommentPlaceholder")}
                />
              </Field>
            </FieldGroup>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            {t("common.close")}
          </DialogClose>
          {!isOwn ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null}
                onClick={() => void decide("rejected")}
              >
                {pending === "rejected" ? <Spinner className="size-4" /> : null}
                {t("leave.reject")}
              </Button>
              <Button
                type="button"
                disabled={pending !== null}
                onClick={() => void decide("approved")}
              >
                {pending === "approved" ? <Spinner className="size-4" /> : null}
                {t("leave.approve")}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BalanceDialog({
  data,
  member,
  trigger,
}: {
  data: EmployeeOverviewData
  member: EmployeeMemberData
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { setAllowanceAction, adjustBalanceAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [leaveType, setLeaveType] = React.useState<BalanceType>("paid_leave")
  const [allowance, setAllowance] = React.useState("0")
  const [adjustmentDays, setAdjustmentDays] = React.useState("")
  const [adjustmentNote, setAdjustmentNote] = React.useState("")
  const [savingAllowance, setSavingAllowance] = React.useState(false)
  const [savingAdjustment, setSavingAdjustment] = React.useState(false)

  const balances = data.balances.filter((row) => row.userId === member.id)
  const current = balances.find((row) => row.leaveType === leaveType)

  React.useEffect(() => {
    if (!open) return
    setAllowance(String(current?.allowanceDays ?? 0))
    setAdjustmentDays("")
    setAdjustmentNote("")
  }, [open, leaveType, current?.allowanceDays])

  const typeItems = TRACKED_LEAVE_TYPES.map((value) => ({
    value,
    label: L.balanceType(value),
  }))
  const allowanceValue = Number(allowance)
  const adjustmentValue = Number(adjustmentDays)
  const allowanceInvalid =
    allowance === "" || !Number.isFinite(allowanceValue) || allowanceValue < 0
  const adjustmentInvalid =
    adjustmentDays === "" ||
    !Number.isFinite(adjustmentValue) ||
    adjustmentValue === 0

  async function saveAllowance() {
    if (allowanceInvalid) return
    setSavingAllowance(true)
    try {
      unwrapActionResult(
        await setAllowanceAction({
          userId: member.id,
          leaveType,
          year: data.year,
          allowanceDays: allowanceValue,
        })
      )
      toast.success(tT("balanceUpdated"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesBalanceFailed"))
    } finally {
      setSavingAllowance(false)
    }
  }

  async function applyAdjustment() {
    if (adjustmentInvalid) return
    setSavingAdjustment(true)
    try {
      unwrapActionResult(
        await adjustBalanceAction({
          userId: member.id,
          leaveType,
          year: data.year,
          days: adjustmentValue,
          note: adjustmentNote.trim() || undefined,
        })
      )
      toast.success(tT("balanceAdjusted"))
      setAdjustmentDays("")
      setAdjustmentNote("")
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesBalanceFailed"))
    } finally {
      setSavingAdjustment(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("leave.balanceTitleName", { name: member.name })}
          </DialogTitle>
          <DialogDescription>
            {t("leave.balanceDialogDescription", { year: data.year })}
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="balance-type">
              {t("leave.balanceType")}
            </FieldLabel>
            <Select
              items={typeItems}
              value={leaveType}
              onValueChange={(value) => setLeaveType(value as BalanceType)}
            >
              <SelectTrigger id="balance-type" className="w-full">
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

          <div className="grid grid-cols-4 gap-2 rounded-md bg-muted px-3 py-2 text-center text-xs">
            <div>
              <p className="text-muted-foreground">{t("leave.acquired")}</p>
              <p className="text-sm font-medium">
                {current?.acquiredDays ?? 0}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("leave.used")}</p>
              <p className="text-sm font-medium">{current?.usedDays ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("leave.pending")}</p>
              <p className="text-sm font-medium">{current?.pendingDays ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("leave.remaining")}</p>
              <p className="text-sm font-medium">
                {current?.remainingDays ?? 0}
              </p>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Field data-invalid={allowanceInvalid} className="flex-1">
              <FieldLabel htmlFor="balance-allowance">
                {t("leave.allowanceLabel")}
              </FieldLabel>
              <Input
                id="balance-allowance"
                type="number"
                min={0}
                max={365}
                step={0.5}
                value={allowance}
                onChange={(event) => setAllowance(event.target.value)}
                aria-invalid={allowanceInvalid}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={savingAllowance || allowanceInvalid}
              onClick={() => void saveAllowance()}
            >
              {savingAllowance ? <Spinner className="size-4" /> : null}
              {t("leave.saveAllowance")}
            </Button>
          </div>

          <div className="flex items-end gap-2">
            <Field data-invalid={adjustmentInvalid} className="w-24">
              <FieldLabel htmlFor="balance-adjustment">
                {t("leave.adjustmentDays")}
              </FieldLabel>
              <Input
                id="balance-adjustment"
                type="number"
                step={0.5}
                value={adjustmentDays}
                onChange={(event) => setAdjustmentDays(event.target.value)}
                placeholder="-2"
                aria-invalid={adjustmentInvalid}
              />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="balance-note">
                {t("leave.adjustmentNote")}
              </FieldLabel>
              <Input
                id="balance-note"
                value={adjustmentNote}
                onChange={(event) => setAdjustmentNote(event.target.value)}
                placeholder={t("leave.adjustmentNotePlaceholder")}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={savingAdjustment || adjustmentInvalid}
              onClick={() => void applyAdjustment()}
            >
              {savingAdjustment ? <Spinner className="size-4" /> : null}
              {t("leave.applyAdjustment")}
            </Button>
          </div>
        </FieldGroup>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            {t("common.close")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
