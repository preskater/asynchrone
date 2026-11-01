"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PencilIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { useEmployeeActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import {
  addMonthsToKey,
  localDateFromKey,
  monthKeyOf,
  round2,
} from "../date-utils"
import type { EmployeeOverviewData, PayrollData, PayrollRow } from "../types"
import { SALARY_TYPES } from "../types"
import { formatHours } from "../utils"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { downloadCsv, useTodayKey } from "./use-employees"

function formatEuro(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Payroll: hourly wages, contribution rates and monthly totals per worker.
 * Hours come from attendance (worked statuses) and money columns derive from
 * the hourly wage and the French contribution rates. Admin-only.
 */
export function PayrollPanel({ data }: { data: EmployeeOverviewData }) {
  const t = useTranslations("Employees")
  const { fetchPayrollAction, exportCsvAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const todayKey = useTodayKey(data.todayKey)

  const [monthKey, setMonthKey] = React.useState(
    () => data.payroll?.monthKey ?? monthKeyOf(todayKey)
  )
  const [payroll, setPayroll] = React.useState<PayrollData | null>(data.payroll)
  const [loading, setLoading] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const requestIdRef = React.useRef(0)

  React.useEffect(() => {
    if (data.payroll && data.payroll.monthKey === monthKey) {
      setPayroll(data.payroll)
      return
    }
    const id = ++requestIdRef.current
    setLoading(true)
    fetchPayrollAction(monthKey)
      .then((result) => {
        if (requestIdRef.current === id) setPayroll(unwrapActionResult(result))
      })
      .catch((error) => toast.error(te(error, "employeesLoadFailed")))
      .finally(() => {
        if (requestIdRef.current === id) setLoading(false)
      })
  }, [monthKey, data.payroll, te])

  const monthLabel = React.useMemo(
    () =>
      localDateFromKey(`${monthKey}-01`).toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
      }),
    [monthKey, locale]
  )

  const rows = payroll?.rows ?? []
  const totals = payroll?.totals
  const hasAnyRate = rows.some((row) => row.hourlyRate > 0)

  async function runExport() {
    setExporting(true)
    try {
      const file = unwrapActionResult(
        await exportCsvAction({ report: "payroll", month: monthKey })
      )
      downloadCsv(file.filename, file.content)
      toast.success(tT("exportReady"))
    } catch (error) {
      toast.error(te(error, "employeesExportFailed"))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t("payroll.previousMonth")}
            title={t("payroll.previousMonth")}
            onClick={() =>
              setMonthKey((current) => addMonthsToKey(current, -1))
            }
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium capitalize">
            {monthLabel}
          </span>
          <Button
            size="icon-sm"
            variant="outline"
            aria-label={t("payroll.nextMonth")}
            title={t("payroll.nextMonth")}
            onClick={() => setMonthKey((current) => addMonthsToKey(current, 1))}
          >
            <ChevronRightIcon />
          </Button>
          {loading ? <Spinner className="size-4" /> : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={exporting}
          onClick={() => void runExport()}
        >
          {exporting ? (
            <Spinner className="size-4" />
          ) : (
            <DownloadIcon data-icon="inline-start" />
          )}
          {t("payroll.exportCsv")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MoneyCard
          label={t("payroll.grossPay")}
          value={totals?.grossPay ?? 0}
          locale={locale}
        />
        <MoneyCard
          label={t("payroll.employeeContribution")}
          value={totals?.employeeContribution ?? 0}
          locale={locale}
          className="text-chart-4"
        />
        <MoneyCard
          label={t("payroll.employerContribution")}
          value={totals?.employerContribution ?? 0}
          locale={locale}
          className="text-chart-1"
        />
        <MoneyCard
          label={t("payroll.netBeforeTax")}
          value={totals?.netBeforeTax ?? 0}
          locale={locale}
          className="text-chart-2"
        />
        <MoneyCard
          label={t("payroll.totalCost")}
          value={totals?.totalCost ?? 0}
          locale={locale}
          className="text-chart-5"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("payroll.tableTitle", { month: monthLabel })}
          </CardTitle>
          <CardDescription>{t("payroll.tableDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {rows.length === 0 ? (
            <p className="px-6 py-6 text-center text-sm text-muted-foreground">
              {t("payroll.empty")}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("payroll.member")}</TableHead>
                    <TableHead>{t("payroll.type")}</TableHead>
                    <TableHead className="text-end">
                      {t("payroll.hours")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("payroll.hourlyRate")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("payroll.grossPay")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("payroll.employeeContribution")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("payroll.employerContribution")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("payroll.netBeforeTax")}
                    </TableHead>
                    <TableHead className="text-end">
                      {t("payroll.totalCost")}
                    </TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const enabled = row.hourlyRate > 0
                    return (
                      <TableRow key={row.userId}>
                        <TableCell className="text-sm font-medium">
                          {row.userName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {L.salaryType(row.salaryType)}
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {formatHours(row.workedHours)} h
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {enabled ? formatEuro(row.hourlyRate, locale) : "—"}
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {enabled ? formatEuro(row.grossPay, locale) : "—"}
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {enabled
                            ? formatEuro(row.employeeContribution, locale)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {enabled
                            ? formatEuro(row.employerContribution, locale)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {enabled ? formatEuro(row.netBeforeTax, locale) : "—"}
                        </TableCell>
                        <TableCell className="text-end text-sm font-semibold">
                          {enabled ? formatEuro(row.totalCost, locale) : "—"}
                        </TableCell>
                        <TableCell>
                          <SalaryDialog
                            row={row}
                            monthLabel={monthLabel}
                            trigger={
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("payroll.edit")}
                                title={t("payroll.edit")}
                              >
                                <PencilIcon />
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm font-semibold">
                      {t("payroll.total")}
                    </TableCell>
                    <TableCell className="text-end text-sm font-semibold">
                      {formatHours(totals?.workedHours ?? 0)} h
                    </TableCell>
                    <TableCell />
                    <TableCell className="text-end text-sm font-semibold">
                      {formatEuro(totals?.grossPay ?? 0, locale)}
                    </TableCell>
                    <TableCell className="text-end text-sm font-semibold">
                      {formatEuro(totals?.employeeContribution ?? 0, locale)}
                    </TableCell>
                    <TableCell className="text-end text-sm font-semibold">
                      {formatEuro(totals?.employerContribution ?? 0, locale)}
                    </TableCell>
                    <TableCell className="text-end text-sm font-semibold">
                      {formatEuro(totals?.netBeforeTax ?? 0, locale)}
                    </TableCell>
                    <TableCell className="text-end text-sm font-semibold">
                      {formatEuro(totals?.totalCost ?? 0, locale)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
              <div className="flex flex-col gap-1 px-6 pt-4">
                <p className="text-xs text-muted-foreground">
                  {t("payroll.formulaHint")}
                </p>
                {!hasAnyRate ? (
                  <p className="text-xs text-muted-foreground">
                    {t("payroll.noRate")}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MoneyCard({
  label,
  value,
  locale,
  className,
}: {
  label: string
  value: number
  locale: string
  className?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={cn("text-2xl", className)}>
          {formatEuro(value, locale)}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function SalaryDialog({
  row,
  monthLabel,
  trigger,
}: {
  row: PayrollRow
  monthLabel: string
  trigger: React.ReactElement
}) {
  const t = useTranslations("Employees")
  const { updateSalaryAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [salaryType, setSalaryType] = React.useState(row.salaryType)
  const [hourlyRate, setHourlyRate] = React.useState(String(row.hourlyRate))
  const [employeeRate, setEmployeeRate] = React.useState(
    String(row.employeeRate)
  )
  const [employerRate, setEmployerRate] = React.useState(
    String(row.employerRate)
  )
  const [submitting, setSubmitting] = React.useState(false)

  function reset() {
    setSalaryType(row.salaryType)
    setHourlyRate(String(row.hourlyRate))
    setEmployeeRate(String(row.employeeRate))
    setEmployerRate(String(row.employerRate))
  }

  const rateValue = Number(hourlyRate)
  const employeeValue = Number(employeeRate)
  const employerValue = Number(employerRate)
  const rateInvalid =
    hourlyRate === "" || !Number.isFinite(rateValue) || rateValue < 0
  const employeeInvalid =
    employeeRate === "" ||
    !Number.isFinite(employeeValue) ||
    employeeValue < 0 ||
    employeeValue > 100
  const employerInvalid =
    employerRate === "" ||
    !Number.isFinite(employerValue) ||
    employerValue < 0 ||
    employerValue > 100
  const invalid = rateInvalid || employeeInvalid || employerInvalid

  const previewGross = round2(row.workedHours * (rateValue || 0))
  const previewEmployee = round2((previewGross * (employeeValue || 0)) / 100)
  const previewEmployer = round2((previewGross * (employerValue || 0)) / 100)
  const previewNet = round2(previewGross - previewEmployee)
  const previewTotal = round2(previewGross + previewEmployer)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (invalid) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await updateSalaryAction({
          userId: row.userId,
          salaryType,
          hourlyRate: rateValue,
          employeeRate: employeeValue,
          employerRate: employerValue,
        })
      )
      toast.success(tT("salaryUpdated"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeesSalaryFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  const salaryItems = SALARY_TYPES.map((value) => ({
    value,
    label: L.salaryType(value),
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
          <DialogTitle>{row.userName}</DialogTitle>
          <DialogDescription>
            {t("payroll.dialogDescription", { name: row.userName })}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="salary-type">
                {t("payroll.salaryType")}
              </FieldLabel>
              <Select
                items={salaryItems}
                value={salaryType}
                onValueChange={(value) =>
                  setSalaryType(value as typeof salaryType)
                }
              >
                <SelectTrigger id="salary-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {salaryItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={rateInvalid}>
                <FieldLabel htmlFor="salary-hourly-rate">
                  {t("payroll.hourlyRateLabel")}
                </FieldLabel>
                <Input
                  id="salary-hourly-rate"
                  type="number"
                  min={0}
                  max={10000}
                  step={0.001}
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(event.target.value)}
                  aria-invalid={rateInvalid}
                />
              </Field>
              <Field data-invalid={employeeInvalid}>
                <FieldLabel htmlFor="salary-employee-rate">
                  {t("payroll.employeeRateLabel")}
                </FieldLabel>
                <Input
                  id="salary-employee-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.001}
                  value={employeeRate}
                  onChange={(event) => setEmployeeRate(event.target.value)}
                  aria-invalid={employeeInvalid}
                />
              </Field>
              <Field data-invalid={employerInvalid}>
                <FieldLabel htmlFor="salary-employer-rate">
                  {t("payroll.employerRateLabel")}
                </FieldLabel>
                <Input
                  id="salary-employer-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={employerRate}
                  onChange={(event) => setEmployerRate(event.target.value)}
                  aria-invalid={employerInvalid}
                />
              </Field>
            </div>
          </FieldGroup>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{t("payroll.previewTitle")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("payroll.previewHours", {
                hours: formatHours(row.workedHours),
                month: monthLabel,
              })}
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">{t("payroll.grossPay")}</dt>
              <dd className="text-end font-medium">
                {formatEuro(previewGross, locale)}
              </dd>
              <dt className="text-muted-foreground">
                {t("payroll.netBeforeTax")}
              </dt>
              <dd className="text-end font-medium">
                {formatEuro(previewNet, locale)}
              </dd>
              <dt className="text-muted-foreground">
                {t("payroll.totalCost")}
              </dt>
              <dd className="text-end font-medium">
                {formatEuro(previewTotal, locale)}
              </dd>
            </dl>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting || invalid}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
