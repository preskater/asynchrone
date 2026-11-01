import type { AttendanceStatus, LeaveStatus } from "./types"

/**
 * Styling for half-day attendance statuses. Colours follow the shared chart
 * tokens (green on-site, blue remote, orange leave/RTT, purple training,
 * yellow business trip) plus the destructive token for sick leave, so they
 * stay legible in both light and dark themes.
 */
export const STATUS_CLASSES: Record<
  AttendanceStatus,
  { cell: string; chip: string; dot: string; text: string }
> = {
  on_site: {
    cell: "bg-[color:var(--chart-2)]/25 hover:bg-[color:var(--chart-2)]/40 text-foreground",
    chip: "bg-[color:var(--chart-2)]/15 text-foreground",
    dot: "bg-[color:var(--chart-2)]",
    text: "text-[color:var(--chart-2)]",
  },
  remote: {
    cell: "bg-[color:var(--chart-3)]/25 hover:bg-[color:var(--chart-3)]/40 text-foreground",
    chip: "bg-[color:var(--chart-3)]/15 text-foreground",
    dot: "bg-[color:var(--chart-3)]",
    text: "text-[color:var(--chart-3)]",
  },
  leave: {
    cell: "bg-[color:var(--chart-4)]/25 hover:bg-[color:var(--chart-4)]/40 text-foreground",
    chip: "bg-[color:var(--chart-4)]/15 text-foreground",
    dot: "bg-[color:var(--chart-4)]",
    text: "text-[color:var(--chart-4)]",
  },
  rtt: {
    cell: "bg-[color:var(--chart-4)]/25 hover:bg-[color:var(--chart-4)]/40 text-foreground",
    chip: "bg-[color:var(--chart-4)]/15 text-foreground",
    dot: "bg-[color:var(--chart-4)]",
    text: "text-[color:var(--chart-4)]",
  },
  sick_leave: {
    cell: "bg-destructive/25 hover:bg-destructive/40 text-foreground",
    chip: "bg-destructive/15 text-foreground",
    dot: "bg-destructive",
    text: "text-destructive",
  },
  training: {
    cell: "bg-[color:var(--chart-5)]/25 hover:bg-[color:var(--chart-5)]/40 text-foreground",
    chip: "bg-[color:var(--chart-5)]/15 text-foreground",
    dot: "bg-[color:var(--chart-5)]",
    text: "text-[color:var(--chart-5)]",
  },
  business_trip: {
    cell: "bg-[color:var(--chart-1)]/30 hover:bg-[color:var(--chart-1)]/45 text-foreground",
    chip: "bg-[color:var(--chart-1)]/20 text-foreground",
    dot: "bg-[color:var(--chart-1)]",
    text: "text-[color:var(--chart-1)]",
  },
  holiday: {
    cell: "bg-[color:var(--chart-4)]/25 hover:bg-[color:var(--chart-4)]/40 text-foreground",
    chip: "bg-[color:var(--chart-4)]/15 text-foreground",
    dot: "bg-[color:var(--chart-4)]",
    text: "text-[color:var(--chart-4)]",
  },
  unavailable: {
    cell: "bg-muted text-muted-foreground hover:bg-muted/70",
    chip: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
  other: {
    cell: "bg-muted text-muted-foreground hover:bg-muted/70",
    chip: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
}

export const LEAVE_STATUS_VARIANT: Record<
  LeaveStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  approved: "default",
  pending: "secondary",
  rejected: "destructive",
  cancelled: "outline",
}
