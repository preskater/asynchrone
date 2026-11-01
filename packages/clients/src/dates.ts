/** Date helpers for client fields stored as `YYYY-MM-DD` day keys. */

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parse a day key as local midnight (avoids UTC boundary shifts). */
export function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00`)
}

export function isDateKey(value: unknown): value is string {
  return typeof value === "string" && DAY_KEY_PATTERN.test(value)
}
