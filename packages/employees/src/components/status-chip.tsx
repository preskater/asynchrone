"use client"

import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"

import { STATUS_CLASSES } from "../colors"
import { isAbsenceStatus, type AttendanceStatus } from "../types"
import { useEnumLabel } from "@workspace/i18n/labels"

export function StatusBadge({
  status,
  className,
}: {
  status: AttendanceStatus
  className?: string
}) {
  const L = useEnumLabel()
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", STATUS_CLASSES[status].chip, className)}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", STATUS_CLASSES[status].dot)}
      />
      {L.attendanceStatus(status)}
    </Badge>
  )
}

/** Small colored square used in calendar cells and legends. */
export function StatusDot({
  status,
  className,
}: {
  status: AttendanceStatus
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2 rounded-full",
        STATUS_CLASSES[status].dot,
        className
      )}
    />
  )
}

export function presenceCategory(status: AttendanceStatus | undefined) {
  if (!status) return "unset" as const
  if (isAbsenceStatus(status)) return "absent" as const
  if (status === "remote") return "remote" as const
  if (status === "on_site" || status === "business_trip")
    return "on_site" as const
  return "absent" as const
}
