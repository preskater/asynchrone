"use client"

import { useTranslations } from "next-intl"
import { XIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import type { AuditFacets } from "@/lib/audit/types"

import { useAuditLabels } from "./audit-labels"

/** `all` is the "no filter" sentinel of the three dropdowns. */
export const ALL = "all"

export interface AuditFilterValues {
  actorId: string
  action: string
  entityType: string
  from: string
  to: string
}

export const EMPTY_FILTERS: AuditFilterValues = {
  actorId: ALL,
  action: ALL,
  entityType: ALL,
  from: "",
  to: "",
}

export function isFiltered(filters: AuditFilterValues): boolean {
  return (
    filters.actorId !== ALL ||
    filters.action !== ALL ||
    filters.entityType !== ALL ||
    filters.from !== "" ||
    filters.to !== ""
  )
}

/** Filter values in the shape the server actions expect. */
export function toActionInput(filters: AuditFilterValues) {
  return {
    actorId: filters.actorId === ALL ? undefined : filters.actorId,
    action: filters.action === ALL ? undefined : filters.action,
    entityType: filters.entityType === ALL ? undefined : filters.entityType,
    from: filters.from || undefined,
    to: filters.to || undefined,
  }
}

export function AuditFilters({
  value,
  facets,
  onChange,
}: {
  value: AuditFilterValues
  facets: AuditFacets | null
  onChange: (next: AuditFilterValues) => void
}) {
  const t = useTranslations("Audit")
  const { action: actionLabel, entity: entityLabel } = useAuditLabels()

  const actorItems = [
    { value: ALL, label: t("filters.anyActor") },
    ...(facets?.actors ?? []).map((actor) => ({
      value: actor.id,
      label: actor.name ?? t("unknownActor"),
    })),
  ]
  const actionItems = [
    { value: ALL, label: t("filters.anyAction") },
    ...(facets?.actions ?? []).map((item) => ({
      value: item.value,
      label: actionLabel(item.value),
    })),
  ]
  const entityItems = [
    { value: ALL, label: t("filters.anyEntity") },
    ...(facets?.entityTypes ?? []).map((item) => ({
      value: item.value,
      label: entityLabel(item.value),
    })),
  ]

  function patch(next: Partial<AuditFilterValues>) {
    onChange({ ...value, ...next })
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-actor">{t("filters.actor")}</Label>
        <Select
          items={actorItems}
          value={value.actorId}
          onValueChange={(next) => patch({ actorId: String(next ?? ALL) })}
        >
          <SelectTrigger id="audit-actor" size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {actorItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-action">{t("filters.action")}</Label>
        <Select
          items={actionItems}
          value={value.action}
          onValueChange={(next) => patch({ action: String(next ?? ALL) })}
        >
          <SelectTrigger id="audit-action" size="sm" className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {actionItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-entity">{t("filters.entityType")}</Label>
        <Select
          items={entityItems}
          value={value.entityType}
          onValueChange={(next) => patch({ entityType: String(next ?? ALL) })}
        >
          <SelectTrigger id="audit-entity" size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {entityItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-from">{t("filters.from")}</Label>
        <Input
          id="audit-from"
          type="date"
          className="w-36"
          value={value.from}
          max={value.to || undefined}
          onChange={(event) => patch({ from: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="audit-to">{t("filters.to")}</Label>
        <Input
          id="audit-to"
          type="date"
          className="w-36"
          value={value.to}
          min={value.from || undefined}
          onChange={(event) => patch({ to: event.target.value })}
        />
      </div>

      {isFiltered(value) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          <XIcon />
          {t("clearFilters")}
        </Button>
      ) : null}
    </div>
  )
}
