"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { formatDateKey, monthDateRange, monthKeyOf } from "../date-utils"
import type { CapacityUserRow, EmployeeOverviewData } from "../types"
import { formatHours } from "../utils"

import { useTodayKey } from "./use-employees"

type CapacityPeriod = "weeks" | "month"

export function CapacityPanel({ data }: { data: EmployeeOverviewData }) {
  const t = useTranslations("Employees")
  const locale = useLocale()
  const todayKey = useTodayKey(data.todayKey)
  const [period, setPeriod] = React.useState<CapacityPeriod>("weeks")

  const monthRange = monthDateRange(monthKeyOf(todayKey))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          value={[period]}
          onValueChange={(value) => {
            const next = value[0] as CapacityPeriod | undefined
            if (next) setPeriod(next)
          }}
          spacing={2}
        >
          <ToggleGroupItem value="weeks" variant="outline" size="sm">
            {t("capacity.nextWeeks")}
          </ToggleGroupItem>
          <ToggleGroupItem value="month" variant="outline" size="sm">
            {t("capacity.monthView", {
              month: formatDateKey(monthRange.start, locale, {
                month: "long",
              }),
            })}
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          {t("capacity.formulaHint")}
        </p>
      </div>

      {period === "weeks" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("capacity.weeksTitle")}
            </CardTitle>
            <CardDescription>{t("capacity.weeksDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-40">
                      {t("capacity.member")}
                    </TableHead>
                    {data.capacityWeeks.map((week) => (
                      <TableHead key={week.weekStart} className="text-center">
                        <span className="whitespace-nowrap">
                          {formatDateKey(week.weekStart, locale)}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.capacityWeeks[0]?.rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell className="text-sm font-medium">
                        {row.userName}
                      </TableCell>
                      {data.capacityWeeks.map((week) => {
                        const cell = week.rows.find(
                          (item) => item.userId === row.userId
                        )
                        return (
                          <TableCell
                            key={week.weekStart}
                            className="text-center"
                          >
                            <CapacityValue row={cell} />
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="text-sm font-semibold">
                      {t("capacity.team")}
                    </TableCell>
                    {data.capacityWeeks.map((week) => (
                      <TableCell key={week.weekStart} className="text-center">
                        <CapacityValue
                          totals={week.totals}
                          label={t("capacity.remainingShort")}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("capacity.monthTitle", {
                month: formatDateKey(monthRange.start, locale, {
                  month: "long",
                  year: "numeric",
                }),
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("capacity.member")}</TableHead>
                  <TableHead className="text-end">
                    {t("capacity.available")}
                  </TableHead>
                  <TableHead className="text-end">
                    {t("capacity.allocated")}
                  </TableHead>
                  <TableHead className="text-end">
                    {t("capacity.remaining")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.capacityMonth.rows.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="text-sm font-medium">
                      {row.userName}
                    </TableCell>
                    <TableCell className="text-end text-sm">
                      {formatHours(row.availableHours)} h
                    </TableCell>
                    <TableCell className="text-end text-sm">
                      {formatHours(row.allocatedHours)} h
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-end text-sm font-semibold",
                        row.remainingHours < 0 && "text-destructive"
                      )}
                    >
                      {formatHours(row.remainingHours)} h
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="text-sm font-semibold">
                    {t("capacity.team")}
                  </TableCell>
                  <TableCell className="text-end text-sm font-semibold">
                    {formatHours(data.capacityMonth.totals.availableHours)} h
                  </TableCell>
                  <TableCell className="text-end text-sm font-semibold">
                    {formatHours(data.capacityMonth.totals.allocatedHours)} h
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-end text-sm font-semibold",
                      data.capacityMonth.totals.remainingHours < 0 &&
                        "text-destructive"
                    )}
                  >
                    {formatHours(data.capacityMonth.totals.remainingHours)} h
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CapacityValue({
  row,
  totals,
  label,
}: {
  row?: CapacityUserRow
  totals?: {
    availableHours: number
    allocatedHours: number
    remainingHours: number
  }
  label?: string
}) {
  if (row) {
    return (
      <div className="flex flex-col items-center leading-tight">
        <span
          className={cn(
            "text-sm font-semibold",
            row.remainingHours < 0 && "text-destructive"
          )}
        >
          {formatHours(row.remainingHours)} h
        </span>
        <span className="text-[10px] text-muted-foreground">
          {formatHours(row.allocatedHours)} / {formatHours(row.availableHours)}
        </span>
      </div>
    )
  }
  if (totals) {
    return (
      <div className="flex flex-col items-center leading-tight">
        <span
          className={cn(
            "text-sm font-semibold",
            totals.remainingHours < 0 && "text-destructive"
          )}
        >
          {formatHours(totals.remainingHours)} h
        </span>
        <span className="text-[10px] text-muted-foreground">{label}</span>
      </div>
    )
  }
  return <span className="text-sm text-muted-foreground">—</span>
}
