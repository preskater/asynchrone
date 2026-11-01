/**
 * Date helpers for employee day-keyed data.
 *
 * Employees stores calendar days, not instants: `@db.Date` columns on the server and
 * "YYYY-MM-DD" strings over the wire. Helpers here come in two flavours:
 *
 * - UTC helpers (`parseDateKey`, `toDateKey`, ...) operate on the canonical
 *   representation shared with the database.
 * - Local helpers (`localDateKey`, `localDateFromKey`) turn the user's
 *   wall-clock date into the same "YYYY-MM-DD" shape, so "today" always
 *   matches the user's calendar.
 */

const DAY_MS = 86_400_000

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-\d{2}$/.test(value)
}

/** Canonical UTC midnight Date for a "YYYY-MM-DD" key (database shape). */
export function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

/** "YYYY-MM-DD" for a Date read from a `@db.Date` column (UTC midnight). */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** The user's local calendar day as "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Local-midnight Date for display formatting (never shifts across days). */
export function localDateFromKey(key: string): Date {
  return new Date(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10))
  )
}

export function addDaysToKey(key: string, amount: number): string {
  return toDateKey(new Date(parseDateKey(key).getTime() + amount * DAY_MS))
}

export function addWeeksToKey(key: string, amount: number): string {
  return addDaysToKey(key, amount * 7)
}

export function isWeekendKey(key: string): boolean {
  const day = parseDateKey(key).getUTCDay()
  return day === 0 || day === 6
}

/** Monday of the week containing `key`. */
export function startOfWeekKey(key: string): string {
  const day = parseDateKey(key).getUTCDay()
  const diff = (day + 6) % 7
  return addDaysToKey(key, -diff)
}

export function monthKeyOf(date: Date | string): string {
  return typeof date === "string"
    ? date.slice(0, 7)
    : toDateKey(date).slice(0, 7)
}

export function addMonthsToKey(monthKey: string, amount: number): string {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const date = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * First and last date keys of a month, e.g. "2026-10" ->
 * { start: "2026-10-01", end: "2026-10-31" }.
 */
export function monthDateRange(monthKey: string): {
  start: string
  end: string
} {
  const year = Number(monthKey.slice(0, 4))
  const month = Number(monthKey.slice(5, 7))
  const endDate = new Date(Date.UTC(year, month, 0))
  return { start: `${monthKey}-01`, end: toDateKey(endDate) }
}

/** Every date key in [startKey, endKey], inclusive. */
export function eachDateKey(startKey: string, endKey: string): string[] {
  const keys: string[] = []
  let cursor = startKey
  while (cursor <= endKey) {
    keys.push(cursor)
    cursor = addDaysToKey(cursor, 1)
  }
  return keys
}

/** Number of business days (Mon-Fri) in [startKey, endKey], inclusive. */
export function countBusinessDays(startKey: string, endKey: string): number {
  if (!isDateKey(startKey) || !isDateKey(endKey) || endKey < startKey) return 0
  let count = 0
  let cursor = startKey
  while (cursor <= endKey) {
    if (!isWeekendKey(cursor)) count += 1
    cursor = addDaysToKey(cursor, 1)
  }
  return count
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Locale-aware formatting of a date key, without timezone drift. */
export function formatDateKey(
  key: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
): string {
  return localDateFromKey(key).toLocaleDateString(locale, options)
}
