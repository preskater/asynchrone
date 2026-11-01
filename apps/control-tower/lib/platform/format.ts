const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const

/** The control-tower API returns ISO strings; pages may also pass Date rows. */
type DateLike = Date | string | null | undefined

function toDate(value: DateLike): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  )
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${
    BYTE_UNITS[exponent]
  }`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value)
}

export function formatUsdMicros(micros: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
  }).format(micros / 1_000_000)
}

export function formatDate(value: DateLike): string {
  const date = toDate(value)
  if (!date) return "—"
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date)
}

export function formatDateTime(value: DateLike): string {
  const date = toDate(value)
  if (!date) return "—"
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatRelative(value: DateLike): string {
  const date = toDate(value)
  if (!date) return "—"
  const delta = Date.now() - date.getTime()
  const future = delta < 0
  const abs = Math.abs(delta)
  const minutes = Math.round(abs / 60_000)

  const relative = (() => {
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.round(hours / 24)
    if (days < 30) return `${days}d`
    return null
  })()

  if (relative === null) return formatDate(date)
  if (relative === "just now") return future ? "in <1m" : relative
  return future ? `in ${relative}` : `${relative} ago`
}
