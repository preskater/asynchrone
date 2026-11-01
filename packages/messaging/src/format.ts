export type CommonTranslator = (...args: never[]) => string

const FALLBACK: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
  allDay: "All day",
  now: "now",
  justNow: "Just now",
  minutesAgo: "{count} min ago",
  hoursAgo: "{count}h ago",
  daysAgo: "{count} days ago",
  minutesShort: "{count}m",
  hoursShort: "{count}h",
  daysShort: "{count}d",
}

function word(
  t: CommonTranslator | undefined,
  key: keyof typeof FALLBACK,
  values?: Record<string, string | number>
) {
  if (t) {
    const translate = t as unknown as (
      key: string,
      values?: Record<string, string | number>
    ) => string
    return translate(`Common.${key}`, values)
  }
  const template = FALLBACK[key] ?? ""
  return values
    ? template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""))
    : template
}

export function formatTime(value: string | Date, locale = "en") {
  return new Date(value).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  })
}

export function formatRelative(
  value: string,
  locale = "en",
  t?: CommonTranslator
) {
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.round(diffMs / 60000)
  if (diffMins < 1) return word(t, "now")
  if (diffMins < 60) return word(t, "minutesShort", { count: diffMins })
  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return word(t, "hoursShort", { count: diffHours })
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return word(t, "daysShort", { count: diffDays })
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" })
}

export function formatDayLabel(
  value: string,
  locale = "en",
  t?: CommonTranslator
) {
  const date = new Date(value)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return word(t, "today")
  if (date.toDateString() === yesterday.toDateString())
    return word(t, "yesterday")
  return date.toLocaleDateString(locale, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

export function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
