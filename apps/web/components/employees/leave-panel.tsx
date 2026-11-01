"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { CalendarPlusIcon, PencilIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { cancelLeaveAction } from "@/actions/employees"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import { LEAVE_STATUS_VARIANT } from "@/lib/employees/colors"
import { formatDateKey } from "@/lib/employees/date-utils"
import type { EmployeeOverviewData, LeaveRequestData } from "@/lib/employees/types"
import { TRACKED_LEAVE_TYPES } from "@/lib/employees/types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import { getInitials } from "@workspace/organization/utils"

import {
  BalanceDialog,
  DecideLeaveDialog,
  RequestLeaveDialog,
} from "./leave-dialogs"

export function LeavePanel({ data }: { data: EmployeeOverviewData }) {
  const t = useTranslations("Employees")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()

  const [cancellingId, setCancellingId] = React.useState<string | null>(null)

  const me = data.currentUserId
  const myRequests = data.leaveRequests.filter(
    (request) => request.userId === me
  )
  const myAdjustments = data.adjustments.filter(
    (adjustment) => adjustment.userId === me
  )
  const activeMembers = data.members.filter(
    (member) => member.profile.isActive
  )

  function formatRange(request: LeaveRequestData) {
    const startHalf =
      request.startPeriod === "morning"
        ? t("leave.amShort")
        : t("leave.pmShort")
    const endHalf =
      request.endPeriod === "morning" ? t("leave.amShort") : t("leave.pmShort")
    return `${formatDateKey(request.startDate, locale)} ${startHalf} – ${formatDateKey(
      request.endDate,
      locale
    )} ${endHalf}`
  }

  async function cancel(request: LeaveRequestData) {
    setCancellingId(request.id)
    try {
      unwrapActionResult(await cancelLeaveAction(request.id))
      toast.success(tT("leaveCancelled"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesCancelFailed"))
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">{t("leave.myRequests")}</CardTitle>
              {data.access.canTrack ? (
                <RequestLeaveDialog
                  data={data}
                  trigger={
                    <Button size="sm">
                      <CalendarPlusIcon data-icon="inline-start" />
                      {t("leave.request")}
                    </Button>
                  }
                />
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {myRequests.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                {t("leave.noRequests")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leave.type")}</TableHead>
                    <TableHead>{t("leave.dates")}</TableHead>
                    <TableHead>{t("leave.days")}</TableHead>
                    <TableHead>{t("leave.status")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRequests.map((request) => {
                    const cancellable =
                      data.access.canTrack &&
                      (request.status === "pending" ||
                        request.status === "approved")
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="text-sm">
                          {L.leaveType(request.type)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatRange(request)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {request.halfDays / 2}
                        </TableCell>
                        <TableCell>
                          <Badge variant={LEAVE_STATUS_VARIANT[request.status]}>
                            {L.leaveStatus(request.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {cancellable ? (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("leave.cancelRequest")}
                              title={t("leave.cancelRequest")}
                              disabled={cancellingId !== null}
                              onClick={() => void cancel(request)}
                            >
                              {cancellingId === request.id ? (
                                <Spinner className="size-4" />
                              ) : (
                                <XIcon />
                              )}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}

            {myAdjustments.length > 0 ? (
              <div className="border-t px-6 py-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                  {t("leave.adjustmentsTitle")}
                </p>
                <ul className="flex flex-col gap-1.5">
                  {myAdjustments.slice(0, 6).map((adjustment) => (
                    <li
                      key={adjustment.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">
                        {formatDateKey(
                          adjustment.createdAt.slice(0, 10),
                          locale
                        )}{" "}
                        · {L.balanceType(adjustment.leaveType)}
                        {adjustment.note ? ` · ${adjustment.note}` : ""}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          adjustment.days < 0 && "text-destructive"
                        )}
                      >
                        {adjustment.days > 0 ? "+" : ""}
                        {adjustment.days}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardDescription>{t("leave.balanceTitle")}</CardDescription>
            <CardTitle className="text-base">{t("leave.myBalances")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {TRACKED_LEAVE_TYPES.map((leaveType) => {
              const balance = data.balances.find(
                (row) => row.userId === me && row.leaveType === leaveType
              )
              if (!balance) return null
              return (
                <div
                  key={leaveType}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{L.balanceType(leaveType)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("leave.acquiredUsed", {
                        acquired: balance.acquiredDays,
                        used: balance.usedDays,
                      })}
                      {balance.pendingDays > 0
                        ? ` · ${t("leave.pendingCount", { count: balance.pendingDays })}`
                        : ""}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "text-lg font-semibold",
                      balance.remainingDays < 0 && "text-destructive"
                    )}
                  >
                    {balance.remainingDays}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {data.access.canViewAll ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("leave.approvalsTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {data.pendingApprovals.length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                {t("leave.noApprovals")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leave.member")}</TableHead>
                    <TableHead>{t("leave.type")}</TableHead>
                    <TableHead>{t("leave.dates")}</TableHead>
                    <TableHead>{t("leave.days")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("leave.comment")}
                    </TableHead>
                    <TableHead className="w-24 text-end" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.pendingApprovals.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="text-sm font-medium">
                        {request.userName}
                        {request.userId === me ? (
                          <span className="ms-1 text-xs text-muted-foreground">
                            {t("leave.you")}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm">
                        {L.leaveType(request.type)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatRange(request)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {request.halfDays / 2}
                      </TableCell>
                      <TableCell
                        className="hidden max-w-48 truncate text-sm text-muted-foreground sm:table-cell"
                        title={request.comment}
                      >
                        {request.comment ?? "—"}
                      </TableCell>
                      <TableCell className="text-end">
                        <DecideLeaveDialog
                          request={request}
                          currentUserId={me}
                          trigger={
                            <Button size="sm" variant="outline">
                              {t("leave.review")}
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {data.access.canViewAll ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">
                {t("leave.teamRequestsTitle")}
              </CardTitle>
              <CardDescription>
                {t("leave.teamRequestsDescription")}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {data.leaveRequests.filter((request) => request.userId !== me)
              .length === 0 ? (
              <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                {t("leave.noTeamRequests")}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("leave.member")}</TableHead>
                    <TableHead>{t("leave.type")}</TableHead>
                    <TableHead>{t("leave.dates")}</TableHead>
                    <TableHead>{t("leave.days")}</TableHead>
                    <TableHead>{t("leave.status")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.leaveRequests
                    .filter((request) => request.userId !== me)
                    .map((request) => {
                      const cancellable =
                        data.access.isAdmin &&
                        (request.status === "pending" ||
                          request.status === "approved")
                      return (
                        <TableRow key={request.id}>
                          <TableCell className="text-sm font-medium">
                            {request.userName}
                          </TableCell>
                          <TableCell className="text-sm">
                            {L.leaveType(request.type)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatRange(request)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {request.halfDays / 2}
                          </TableCell>
                          <TableCell>
                            <Badge variant={LEAVE_STATUS_VARIANT[request.status]}>
                              {L.leaveStatus(request.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {cancellable ? (
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("leave.cancelRequest")}
                                title={t("leave.cancelRequest")}
                                disabled={cancellingId !== null}
                                onClick={() => void cancel(request)}
                              >
                                {cancellingId === request.id ? (
                                  <Spinner className="size-4" />
                                ) : (
                                  <XIcon />
                                )}
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {data.access.canViewAll ? (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">
                {t("leave.teamBalancesTitle")}
              </CardTitle>
              <CardDescription>
                {t("leave.teamBalancesDescription", { year: data.year })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("leave.member")}</TableHead>
                  <TableHead>{L.balanceType("paid_leave")}</TableHead>
                  <TableHead>{L.balanceType("rtt")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {L.balanceType("recovery")}
                  </TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeMembers.map((member) => {
                  const forType = (leaveType: string) =>
                    data.balances.find(
                      (row) =>
                        row.userId === member.id &&
                        row.leaveType === leaveType
                    )
                  const paid = forType("paid_leave")
                  const rtt = forType("rtt")
                  const recovery = forType("recovery")
                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            {member.avatarUrl ? (
                              <AvatarImage src={member.avatarUrl} alt="" />
                            ) : null}
                            <AvatarFallback className="text-[10px]">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate text-sm font-medium">
                            {member.name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <BalanceCell
                          remaining={paid?.remainingDays ?? 0}
                          acquired={paid?.acquiredDays ?? 0}
                        />
                      </TableCell>
                      <TableCell>
                        <BalanceCell
                          remaining={rtt?.remainingDays ?? 0}
                          acquired={rtt?.acquiredDays ?? 0}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <BalanceCell
                          remaining={recovery?.remainingDays ?? 0}
                          acquired={recovery?.acquiredDays ?? 0}
                        />
                      </TableCell>
                      <TableCell>
                        {data.access.isAdmin ? (
                          <BalanceDialog
                            data={data}
                            member={member}
                            trigger={
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("leave.manageBalance")}
                                title={t("leave.manageBalance")}
                              >
                                <PencilIcon />
                              </Button>
                            }
                          />
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function BalanceCell({
  remaining,
  acquired,
}: {
  remaining: number
  acquired: number
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <span
        className={cn("font-semibold", remaining < 0 && "text-destructive")}
      >
        {remaining}
      </span>
      <span className="text-xs text-muted-foreground">/ {acquired}</span>
    </div>
  )
}
