import type { EventColor } from "@workspace/calendars/types"

export const EVENT_COLOR_VAR: Record<EventColor, string> = {
  blue: "var(--chart-3)",
  green: "var(--chart-2)",
  orange: "var(--chart-4)",
  red: "var(--destructive)",
  purple: "var(--chart-5)",
}

export const EVENT_COLOR_CLASSES: Record<
  EventColor,
  { block: string; chip: string; dot: string; text: string }
> = {
  blue: {
    block: "border-s-[color:var(--chart-3)] bg-[color:var(--chart-3)]/15",
    chip: "bg-[color:var(--chart-3)]/15 text-foreground",
    dot: "bg-[color:var(--chart-3)]",
    text: "text-[color:var(--chart-3)]",
  },
  green: {
    block: "border-s-[color:var(--chart-2)] bg-[color:var(--chart-2)]/15",
    chip: "bg-[color:var(--chart-2)]/15 text-foreground",
    dot: "bg-[color:var(--chart-2)]",
    text: "text-[color:var(--chart-2)]",
  },
  orange: {
    block: "border-s-[color:var(--chart-4)] bg-[color:var(--chart-4)]/15",
    chip: "bg-[color:var(--chart-4)]/15 text-foreground",
    dot: "bg-[color:var(--chart-4)]",
    text: "text-[color:var(--chart-4)]",
  },
  red: {
    block: "border-s-destructive bg-destructive/15",
    chip: "bg-destructive/15 text-foreground",
    dot: "bg-destructive",
    text: "text-destructive",
  },
  purple: {
    block: "border-s-[color:var(--chart-5)] bg-[color:var(--chart-5)]/15",
    chip: "bg-[color:var(--chart-5)]/15 text-foreground",
    dot: "bg-[color:var(--chart-5)]",
    text: "text-[color:var(--chart-5)]",
  },
}

export const RESPONSE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  accepted: "default",
  tentative: "secondary",
  declined: "destructive",
  pending: "outline",
}

export const RESPONSE_LABEL: Record<string, string> = {
  accepted: "Accepted",
  tentative: "Tentative",
  declined: "Declined",
  pending: "No response",
}
