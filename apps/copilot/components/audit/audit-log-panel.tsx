"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { DownloadIcon, FileJsonIcon, ShieldCheckIcon } from "lucide-react"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  exportAuditLogAction,
  getAuditRetentionAction,
  listAuditLogAction,
  loadAuditFacetsAction,
} from "@/actions/audit"
import { AUDIT_EXPORT_LIMIT, AUDIT_PAGE_SIZE } from "@/lib/audit/filters"
import type {
  AuditEntryView,
  AuditExportFormat,
  AuditFacets,
  AuditRetentionView,
} from "@/lib/audit/types"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEntitlements } from "@/lib/organization/use-entitlements"

import { PlanUpgradePrompt } from "@/components/organization/plan-upgrade-prompt"

import {
  AuditFilters,
  EMPTY_FILTERS,
  isFiltered,
  toActionInput,
  type AuditFilterValues,
} from "./audit-filters"
import { AuditRetentionCard } from "./audit-retention-card"
import { AuditTable } from "./audit-table"

function download(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Settings → Audit log. Owners and admins read the trail their plan includes;
 * the server action re-checks both the role and the `auditLog` entitlement.
 */
export function AuditLogPanel({
  organizationName,
  isOwner,
}: {
  organizationName: string
  isOwner: boolean
}) {
  const t = useTranslations("Audit")
  const te = useErrorTranslator()
  const { can } = useEntitlements()
  const entitled = can("auditLog")

  const [filters, setFilters] = React.useState<AuditFilterValues>(EMPTY_FILTERS)
  const [items, setItems] = React.useState<AuditEntryView[]>([])
  const [nextCursor, setNextCursor] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [facets, setFacets] = React.useState<AuditFacets | null>(null)
  const [retention, setRetention] = React.useState<AuditRetentionView | null>(
    null
  )
  const [loading, setLoading] = React.useState(entitled)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const [exporting, setExporting] = React.useState<AuditExportFormat | null>(
    null
  )
  const [error, setError] = React.useState<string | null>(null)

  const filtered = isFiltered(filters)

  React.useEffect(() => {
    if (!entitled) return
    let active = true
    void (async () => {
      try {
        const [loadedFacets, loadedRetention] = await Promise.all([
          unwrapActionResult(await loadAuditFacetsAction()),
          unwrapActionResult(await getAuditRetentionAction()),
        ])
        if (!active) return
        setFacets(loadedFacets)
        setRetention(loadedRetention)
      } catch (cause) {
        if (active) setError(te(cause, "internal"))
      }
    })()
    return () => {
      active = false
    }
  }, [entitled, te])

  React.useEffect(() => {
    if (!entitled) return
    let active = true
    setLoading(true)
    void (async () => {
      try {
        const page = await unwrapActionResult(
          await listAuditLogAction({
            ...toActionInput(filters),
            limit: AUDIT_PAGE_SIZE,
          })
        )
        if (!active) return
        setItems(page.items)
        setNextCursor(page.nextCursor)
        setTotal(page.total)
        setError(null)
      } catch (cause) {
        if (!active) return
        setItems([])
        setNextCursor(null)
        setTotal(0)
        setError(te(cause, "internal"))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [entitled, filters, te])

  async function loadMore() {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const page = await unwrapActionResult(
        await listAuditLogAction({
          ...toActionInput(filters),
          cursor: nextCursor,
          limit: AUDIT_PAGE_SIZE,
        })
      )
      setItems((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (cause) {
      toast.error(te(cause, "internal"))
    } finally {
      setLoadingMore(false)
    }
  }

  async function exportAs(format: AuditExportFormat) {
    setExporting(format)
    try {
      const file = await unwrapActionResult(
        await exportAuditLogAction({ ...toActionInput(filters), format })
      )
      if (file.count === 0) {
        toast.info(t("export.empty"))
        return
      }
      download(file.filename, file.content, file.contentType)
      toast.success(t("export.ready"))
      if (file.truncated) {
        toast.warning(t("export.truncated", { limit: AUDIT_EXPORT_LIMIT }))
      }
    } catch (cause) {
      toast.error(te(cause, "internal"))
    } finally {
      setExporting(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4" />
              {t("title")}
            </CardTitle>
            <CardDescription>
              {t("description", { name: organizationName })}
            </CardDescription>
          </div>
          {entitled ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={exporting !== null || items.length === 0}
                onClick={() => void exportAs("csv")}
              >
                {exporting === "csv" ? <Spinner /> : <DownloadIcon />}
                {t("export.csv")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={exporting !== null || items.length === 0}
                onClick={() => void exportAs("json")}
              >
                {exporting === "json" ? <Spinner /> : <FileJsonIcon />}
                {t("export.json")}
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!entitled ? <PlanUpgradePrompt feature="auditLog" /> : null}

        {entitled ? (
          <>
            <AuditFilters
              value={filters}
              facets={facets}
              onChange={setFilters}
            />

            {retention ? (
              <AuditRetentionCard
                retention={retention}
                canEdit={isOwner}
                onChanged={setRetention}
              />
            ) : null}

            <p className="text-sm text-muted-foreground">
              {filtered
                ? t("totalFiltered", { count: total })
                : t("total", { count: total })}
            </p>

            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : loading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : items.length === 0 ? (
              <Empty className="border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ShieldCheckIcon />
                  </EmptyMedia>
                  <EmptyTitle>
                    {filtered ? t("emptyFilteredTitle") : t("emptyTitle")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {filtered
                      ? t("emptyFilteredDescription")
                      : t("emptyDescription")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <AuditTable entries={items} />
                </div>
                {nextCursor ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={loadingMore}
                      onClick={() => void loadMore()}
                    >
                      {loadingMore ? <Spinner /> : null}
                      {t("loadMore")}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
