"use client"

import { cn } from "@workspace/ui/lib/utils"

import { useEnumLabel } from "@workspace/i18n/labels"
import type { Presence } from "../types"

const PRESENCE_COLOR: Record<Presence, string> = {
  online: "bg-emerald-500",
  away: "bg-amber-500",
  busy: "bg-destructive",
  offline: "bg-muted-foreground/40",
}

function presenceKey(presence: Presence) {
  return presence === "online" ? "available" : presence
}

export function PresenceDot({
  presence = "offline",
  className,
  label = false,
}: {
  presence?: Presence
  className?: string
  label?: boolean
}) {
  const L = useEnumLabel()
  const presenceLabel = L.presence(presenceKey(presence))

  if (label) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
        <span
          aria-hidden
          className={cn("size-2 rounded-full", PRESENCE_COLOR[presence])}
        />
        {presenceLabel}
      </span>
    )
  }

  return (
    <span
      aria-label={presenceLabel}
      title={presenceLabel}
      className={cn(
        "absolute end-0 bottom-0 z-10 size-2.5 rounded-full ring-2 ring-background",
        PRESENCE_COLOR[presence],
        className
      )}
    />
  )
}
