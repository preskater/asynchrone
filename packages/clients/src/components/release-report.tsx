"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { ArrowLeftIcon, DownloadIcon, PrinterIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { unwrapActionResult } from "@workspace/core/action"
import { FEEDBACK_CATEGORIES, FEEDBACK_IMPACTS } from "@workspace/core/feedback"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import { Link } from "@workspace/i18n/navigation"

import {
  CLIENT_FEEDBACK_OPEN_STATUSES,
  CLIENT_FEEDBACK_STATUSES,
  type ClientExportResultData,
  type ReleaseReportView,
} from "../types"
import { useClientActions } from "./actions"
import { downloadCsv, useClientFormat } from "./use-clients"

// Printing hides the workspace shell around the report, on this page only.
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #release-report, #release-report * { visibility: visible !important; }
  #release-report { position: absolute; inset: 0 auto auto 0; width: 100%; }
}`

/**
 * The release report ("compte rendu"). The clients app shows it with the CSV
 * export; the client portal (Copilot) shows the shared copy without it, so
 * only the export button needs the clients actions.
 */
export function ReleaseReport({
  report,
  backHref,
  backLabel,
  canExport,
}: {
  report: ReleaseReportView
  backHref: string
  backLabel: string
  canExport: boolean
}) {
  const t = useTranslations("Clients")
  const L = useEnumLabel()
  const { day, dateTime } = useClientFormat()

  const { release, summary } = report
  const openStatuses = new Set<string>(CLIENT_FEEDBACK_OPEN_STATUSES)
  const stillOpen = report.feedback.filter((item) =>
    openStatuses.has(item.status)
  )

  return (
    <div className="flex flex-col gap-4">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={backHref}
          prefetch={false}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          {backLabel}
        </Link>
        <div className="flex flex-wrap gap-2">
          {canExport ? <ExportCsvButton releaseId={release.id} /> : null}
          <Button type="button" size="sm" onClick={() => window.print()}>
            <PrinterIcon data-icon="inline-start" />
            {t("feedback.report.print")}
          </Button>
        </div>
      </div>

      <article
        id="release-report"
        className="flex flex-col gap-8 rounded-xl border bg-card p-6 text-card-foreground md:p-10 print:border-0 print:p-0"
      >
        <header className="flex flex-col gap-4 border-b pb-6">
          <p className="text-sm font-medium text-muted-foreground">
            {report.clientName} · {t("feedback.report.title")}
          </p>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-4xl font-semibold tabular-nums">
              {release.version}
            </h1>
            {release.label ? (
              <span className="text-lg text-muted-foreground">
                {release.label}
              </span>
            ) : null}
            <Badge variant="secondary">
              {L.clientReleaseStatus(release.status)}
            </Badge>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <Meta
              label={t("feedback.report.releasedAt")}
              value={day(release.releasedAt)}
            />
            <Meta
              label={t("feedback.report.period")}
              value={
                !release.testedFrom
                  ? "—"
                  : release.testedFrom === release.testedTo
                    ? dateTime(release.testedFrom)
                    : `${dateTime(release.testedFrom)} – ${dateTime(release.testedTo)}`
              }
            />
            <Meta
              label={t("feedback.report.generatedAt")}
              value={dateTime(report.generatedAt)}
            />
          </dl>
        </header>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            {t("feedback.report.summary")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Total label={t("feedback.report.total")} value={summary.total} />
            <Total
              label={t("feedback.report.openCount")}
              value={summary.open}
            />
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            <Breakdown
              title={t("feedback.fields.status")}
              rows={CLIENT_FEEDBACK_STATUSES.map((value) => [
                L.clientFeedbackStatus(value),
                summary.byStatus[value] ?? 0,
              ])}
            />
            <Breakdown
              title={t("feedback.fields.category")}
              rows={FEEDBACK_CATEGORIES.map((value) => [
                L.feedbackCategory(value),
                summary.byCategory[value] ?? 0,
              ])}
            />
            <Breakdown
              title={t("feedback.fields.impact")}
              rows={FEEDBACK_IMPACTS.map((value) => [
                L.feedbackImpact(value),
                summary.byImpact[value] ?? 0,
              ])}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {t("feedback.report.stillOpen")}
          </h2>
          {stillOpen.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("feedback.report.noneOpen")}
            </p>
          ) : (
            <FeedbackTable items={stillOpen} />
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("feedback.report.all")}</h2>
          {report.feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("feedback.report.empty")}
            </p>
          ) : (
            <FeedbackTable items={report.feedback} withBody />
          )}
        </section>
      </article>
    </div>
  )
}

function ExportCsvButton({ releaseId }: { releaseId: string }) {
  const t = useTranslations("Clients")
  const te = useErrorTranslator()
  const { exportReleaseCsvAction } = useClientActions()
  const [exporting, setExporting] = React.useState(false)

  async function exportCsv() {
    setExporting(true)
    try {
      const file = unwrapActionResult<ClientExportResultData>(
        await exportReleaseCsvAction({
          releaseId,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
      )
      downloadCsv(file.filename, file.content)
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={exporting}
      onClick={() => void exportCsv()}
    >
      <DownloadIcon data-icon="inline-start" />
      {t("feedback.report.exportCsv")}
    </Button>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function Breakdown({
  title,
  rows,
}: {
  title: string
  rows: [string, number][]
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, count]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className={count === 0 ? "text-muted-foreground" : undefined}>
              {label}
            </dt>
            <dd className="tabular-nums">{count}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function FeedbackTable({
  items,
  withBody = false,
}: {
  items: ReleaseReportView["feedback"]
  withBody?: boolean
}) {
  const t = useTranslations("Clients")
  const L = useEnumLabel()
  const { dateTime } = useClientFormat()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">
              {t("feedback.fields.testedAt")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("feedback.fields.title")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("feedback.fields.impact")}
            </th>
            <th className="py-2 pr-4 font-medium">
              {t("feedback.fields.status")}
            </th>
            <th className="py-2 font-medium">{t("feedback.fields.tester")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <tr key={item.id} className="break-inside-avoid align-top">
              <td className="py-2 pr-4 whitespace-nowrap tabular-nums">
                {dateTime(item.testedAt)}
              </td>
              <td className="py-2 pr-4">
                <div className="font-medium">{item.title}</div>
                <div className="text-xs text-muted-foreground">
                  {L.feedbackCategory(item.category)} ·{" "}
                  {L.clientFeedbackEnvironment(item.environment)}
                </div>
                {withBody ? (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                    {item.body}
                  </p>
                ) : null}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {L.feedbackImpact(item.impact)}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {L.clientFeedbackStatus(item.status)}
              </td>
              <td className="py-2 whitespace-nowrap">
                {item.contactName ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
