"use client"

import * as React from "react"
import { CalendarClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  getMeetingSettingsAction,
  updateMeetingSettingsAction,
} from "@/actions/meetings"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
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

import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import {
  MEETING_PROVIDERS,
  type MeetingProviderId,
  type MeetingSettingsData,
} from "@workspace/meetings/types"
import { useOrgPermissions } from "@/lib/permissions"

/** Organization rules for client meeting requests (Settings → Meetings). */
export function MeetingSettingsForm() {
  const t = useTranslations("MeetingRequests")
  const L = useEnumLabel()
  const te = useErrorTranslator()
  const permissions = useOrgPermissions()
  const [settings, setSettings] = React.useState<MeetingSettingsData>()
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const data = unwrapActionResult(await getMeetingSettingsAction())
        if (!cancelled) setSettings(data)
      } catch (error) {
        if (!cancelled) toast.error(te(error))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [te])

  const canEdit = permissions.can("meeting:manage")

  function patch(update: Partial<MeetingSettingsData>) {
    setSettings((previous) =>
      previous ? { ...previous, ...update } : previous
    )
  }

  async function save() {
    if (!settings) return
    setSaving(true)
    try {
      const saved = unwrapActionResult(
        await updateMeetingSettingsAction({
          clientRequestsEnabled: settings.clientRequestsEnabled,
          autoDeclineOverlaps: settings.autoDeclineOverlaps,
          bookingWindowDays: settings.bookingWindowDays,
          minNoticeHours: settings.minNoticeHours,
          defaultDurationMinutes: settings.defaultDurationMinutes,
          maxDurationMinutes: settings.maxDurationMinutes,
          provider: settings.provider,
        })
      )
      setSettings(saved)
      toast.success(t("settingsSaved"))
    } catch (error) {
      toast.error(te(error))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  const providerItems = MEETING_PROVIDERS.map((provider) => ({
    value: provider,
    label: L.meetingProvider(provider),
  }))
  const requiresConnection = settings.provider !== "manual"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClockIcon className="size-4" />
          {t("settingsTitle")}
        </CardTitle>
        <CardDescription>{t("settingsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="meeting-requests-enabled"
              checked={settings.clientRequestsEnabled}
              onCheckedChange={(checked) =>
                patch({ clientRequestsEnabled: checked === true })
              }
              disabled={!canEdit}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel
                htmlFor="meeting-requests-enabled"
                className="font-normal"
              >
                {t("settingsEnabled")}
              </FieldLabel>
              <FieldDescription>
                {t("settingsEnabledDescription")}
              </FieldDescription>
            </div>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="meeting-auto-decline"
              checked={settings.autoDeclineOverlaps}
              onCheckedChange={(checked) =>
                patch({ autoDeclineOverlaps: checked === true })
              }
              disabled={!canEdit}
            />
            <div className="flex flex-col gap-1">
              <FieldLabel
                htmlFor="meeting-auto-decline"
                className="font-normal"
              >
                {t("settingsAutoDecline")}
              </FieldLabel>
              <FieldDescription>
                {t("settingsAutoDeclineDescription")}
              </FieldDescription>
            </div>
          </Field>
        </FieldGroup>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="meeting-window">
              {t("settingsWindow")}
            </FieldLabel>
            <Input
              id="meeting-window"
              type="number"
              min={1}
              max={365}
              value={settings.bookingWindowDays}
              onChange={(event) =>
                patch({ bookingWindowDays: Number(event.target.value) })
              }
              disabled={!canEdit}
            />
            <FieldDescription>
              {t("settingsWindowDescription")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="meeting-notice">
              {t("settingsNotice")}
            </FieldLabel>
            <Input
              id="meeting-notice"
              type="number"
              min={0}
              max={720}
              value={settings.minNoticeHours}
              onChange={(event) =>
                patch({ minNoticeHours: Number(event.target.value) })
              }
              disabled={!canEdit}
            />
            <FieldDescription>
              {t("settingsNoticeDescription")}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="meeting-default-duration">
              {t("settingsDefaultDuration")}
            </FieldLabel>
            <Input
              id="meeting-default-duration"
              type="number"
              min={15}
              max={480}
              step={15}
              value={settings.defaultDurationMinutes}
              onChange={(event) =>
                patch({ defaultDurationMinutes: Number(event.target.value) })
              }
              disabled={!canEdit}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="meeting-max-duration">
              {t("settingsMaxDuration")}
            </FieldLabel>
            <Input
              id="meeting-max-duration"
              type="number"
              min={15}
              max={480}
              step={15}
              value={settings.maxDurationMinutes}
              onChange={(event) =>
                patch({ maxDurationMinutes: Number(event.target.value) })
              }
              disabled={!canEdit}
            />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="meeting-provider">
            {t("settingsProvider")}
          </FieldLabel>
          <Select
            items={providerItems}
            value={settings.provider}
            onValueChange={(value) =>
              patch({ provider: value as MeetingProviderId })
            }
          >
            <SelectTrigger
              id="meeting-provider"
              className="w-full"
              disabled={!canEdit}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {providerItems.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    disabled={item.value !== "manual"}
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {requiresConnection
              ? t("settingsProviderNotConnected")
              : t("settingsProviderDescription")}
          </FieldDescription>
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {!canEdit ? (
            <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            onClick={() => void save()}
            disabled={!canEdit || saving}
          >
            {saving ? t("saving") : t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
