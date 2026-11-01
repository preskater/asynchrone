"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Spinner } from "@workspace/ui/components/spinner"

import { setAuditRetentionAction } from "@/actions/audit"
import { unwrapActionResult } from "@workspace/core/action"
import type { AuditRetentionView } from "@/lib/audit/types"
import { useErrorTranslator } from "@workspace/i18n/errors"

/**
 * Retention summary. Enterprise owners can pick their own window; every other
 * plan shows the window its cleanup job enforces.
 */
export function AuditRetentionCard({
  retention,
  canEdit,
  onChanged,
}: {
  retention: AuditRetentionView
  canEdit: boolean
  onChanged: (next: AuditRetentionView) => void
}) {
  const t = useTranslations("Audit")
  const te = useErrorTranslator()
  const [value, setValue] = React.useState(
    String(retention.overrideDays ?? retention.days)
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setValue(String(retention.overrideDays ?? retention.days))
  }, [retention.days, retention.overrideDays])

  async function save(days: number | null) {
    setSaving(true)
    try {
      const next = await unwrapActionResult(await setAuditRetentionAction(days))
      onChanged(next)
      toast.success(t("retentionSaved"))
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSaving(false)
    }
  }

  const editable = canEdit && retention.canConfigure

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {t("retentionSummary", { days: retention.days })}
        {retention.canConfigure
          ? ` ${t("retentionEditable", {
              min: retention.minDays,
              max: retention.maxDays,
            })}`
          : ` ${t("retentionFixed")}`}
      </p>
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const days = Number(value)
            if (!Number.isFinite(days) || days < retention.minDays) return
            void save(days)
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="audit-retention">{t("retentionInputLabel")}</Label>
            <Input
              id="audit-retention"
              type="number"
              inputMode="numeric"
              min={retention.minDays}
              max={retention.maxDays}
              className="w-32"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Spinner /> : null}
            {saving ? t("retentionSaving") : t("retentionSave")}
          </Button>
          {retention.overrideDays !== null ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => void save(null)}
            >
              {t("retentionReset")}
            </Button>
          ) : null}
        </form>
      ) : null}
    </div>
  )
}
