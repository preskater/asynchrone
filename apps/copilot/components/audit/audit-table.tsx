"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { AuditEntryView } from "@/lib/audit/types"
import { auditChanges } from "@/lib/audit/changes"
import { SYSTEM_ACTOR_ID } from "@/lib/audit/actions"
import { useFormatters } from "@workspace/i18n/format"

import { useAuditLabels } from "./audit-labels"

const VISIBLE_CHANGES = 2

function actorName(
  entry: AuditEntryView,
  systemLabel: string,
  unknownLabel: string
): string {
  if (entry.actorId === SYSTEM_ACTOR_ID) return systemLabel
  return entry.actorName ?? entry.actorEmail ?? unknownLabel
}

export function AuditTable({ entries }: { entries: AuditEntryView[] }) {
  const t = useTranslations("Audit")
  const { action: actionLabel, entity: entityLabel } = useAuditLabels()
  const { format } = useFormatters()

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columns.when")}</TableHead>
          <TableHead>{t("columns.actor")}</TableHead>
          <TableHead>{t("columns.action")}</TableHead>
          <TableHead>{t("columns.target")}</TableHead>
          <TableHead className="hidden sm:table-cell">
            {t("columns.changes")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const changes = auditChanges(entry.before, entry.after)
          return (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {format.dateTime(new Date(entry.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </TableCell>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {actorName(entry, t("system"), t("unknownActor"))}
                  </span>
                  {entry.actorEmail && entry.actorId !== SYSTEM_ACTOR_ID ? (
                    <span className="text-xs text-muted-foreground">
                      {entry.actorEmail}
                    </span>
                  ) : null}
                  {entry.ipAddress ? (
                    <span
                      className="text-xs text-muted-foreground"
                      title={entry.userAgent ?? undefined}
                    >
                      {entry.ipAddress}
                    </span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="font-normal">
                  {actionLabel(entry.action)}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex w-40 flex-col">
                  <span className="truncate">
                    {entry.entityLabel ?? entityLabel(entry.entityType)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entityLabel(entry.entityType)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="hidden max-w-64 sm:table-cell">
                <div className="flex w-48 flex-col gap-0.5 text-xs">
                  {changes.length === 0 ? (
                    <span className="text-muted-foreground">
                      {t("noChanges")}
                    </span>
                  ) : (
                    changes.slice(0, VISIBLE_CHANGES).map((change) => (
                      <span key={change.field} className="truncate">
                        <span className="text-muted-foreground">
                          {change.field}:
                        </span>{" "}
                        {change.before ?? "—"} → {change.after ?? "—"}
                      </span>
                    ))
                  )}
                  {changes.length > VISIBLE_CHANGES ? (
                    <span className="text-muted-foreground">
                      {t("moreChanges", {
                        count: changes.length - VISIBLE_CHANGES,
                      })}
                    </span>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
