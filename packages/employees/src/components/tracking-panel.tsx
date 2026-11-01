"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { useEmployeeActions } from "./actions"
import { unwrapActionResult } from "@workspace/core/action"
import {
  addDaysToKey,
  monthDateRange,
  monthKeyOf,
  startOfWeekKey,
} from "../date-utils"
import type {
  EmployeeOverviewData,
  TrackingResult,
  TrackingRow,
} from "../types"
import { formatHours } from "../utils"
import { useErrorTranslator } from "@workspace/i18n/errors"

import { useTodayKey } from "./use-employees"

type TrackingPeriod = "week" | "month" | "all"

export function TrackingPanel({ data }: { data: EmployeeOverviewData }) {
  const t = useTranslations("Employees")
  const { fetchTrackingAction } = useEmployeeActions()
  const te = useErrorTranslator()
  const todayKey = useTodayKey(data.todayKey)

  const [period, setPeriod] = React.useState<TrackingPeriod>("month")
  const [result, setResult] = React.useState<TrackingResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const requestIdRef = React.useRef(0)

  const range = React.useMemo(() => {
    if (period === "week") {
      const start = startOfWeekKey(todayKey)
      return { start, end: addDaysToKey(start, 6) }
    }
    if (period === "month") {
      return monthDateRange(monthKeyOf(todayKey))
    }
    return { start: "2000-01-01", end: todayKey }
  }, [period, todayKey])

  React.useEffect(() => {
    const id = ++requestIdRef.current
    setLoading(true)
    fetchTrackingAction(range.start, range.end)
      .then((actionResult) => {
        if (requestIdRef.current !== id) return
        setResult(unwrapActionResult(actionResult))
      })
      .catch((error) => toast.error(te(error, "employeesLoadFailed")))
      .finally(() => {
        if (requestIdRef.current === id) setLoading(false)
      })
  }, [range.start, range.end, te])

  const totals = result?.totals

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          value={[period]}
          onValueChange={(value) => {
            const next = value[0] as TrackingPeriod | undefined
            if (next) setPeriod(next)
          }}
          spacing={2}
        >
          <ToggleGroupItem value="week" variant="outline" size="sm">
            {t("tracking.thisWeek")}
          </ToggleGroupItem>
          <ToggleGroupItem value="month" variant="outline" size="sm">
            {t("tracking.thisMonth")}
          </ToggleGroupItem>
          <ToggleGroupItem value="all" variant="outline" size="sm">
            {t("tracking.allTime")}
          </ToggleGroupItem>
        </ToggleGroup>
        {loading ? <Spinner className="size-4" /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TotalCard
          label={t("tracking.total")}
          value={totals?.totalHours ?? 0}
        />
        <TotalCard
          label={t("tracking.billable")}
          value={totals?.billableHours ?? 0}
          className="text-[color:var(--chart-2)]"
        />
        <TotalCard
          label={t("tracking.nonBillable")}
          value={totals?.nonBillableHours ?? 0}
          className="text-[color:var(--chart-4)]"
        />
        <TotalCard
          label={t("tracking.internal")}
          value={totals?.internalHours ?? 0}
          className="text-[color:var(--chart-5)]"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <TrackingCard
          title={t("tracking.byUser")}
          rows={result?.rowsByUser ?? []}
          emptyLabel={t("tracking.empty")}
        />
        <TrackingCard
          title={t("tracking.byProject")}
          rows={result?.rowsByProject ?? []}
          emptyLabel={t("tracking.empty")}
        />
      </div>

      {result && result.rowsByClient.length > 0 ? (
        <TrackingCard
          title={t("tracking.byClient")}
          rows={result.rowsByClient}
          emptyLabel={t("tracking.empty")}
        />
      ) : null}
    </div>
  )
}

function TotalCard({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl", className)}>
          {formatHours(value)} h
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function TrackingCard({
  title,
  rows,
  emptyLabel,
}: {
  title: string
  rows: TrackingRow[]
  emptyLabel: string
}) {
  const t = useTranslations("Employees")
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("tracking.label")}</TableHead>
                <TableHead className="text-end">
                  {t("tracking.billable")}
                </TableHead>
                <TableHead className="text-end">
                  {t("tracking.nonBillable")}
                </TableHead>
                <TableHead className="text-end">
                  {t("tracking.internal")}
                </TableHead>
                <TableHead className="text-end">
                  {t("tracking.total")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {row.label}
                      </span>
                      {row.sublabel ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {row.sublabel}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-end text-sm">
                    {row.billableHours
                      ? `${formatHours(row.billableHours)} h`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-end text-sm">
                    {row.nonBillableHours
                      ? `${formatHours(row.nonBillableHours)} h`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-end text-sm">
                    {row.internalHours
                      ? `${formatHours(row.internalHours)} h`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-end text-sm font-semibold">
                    {formatHours(row.totalHours)} h
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
