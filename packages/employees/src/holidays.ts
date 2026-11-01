import { addDaysToKey, isWeekendKey } from "./date-utils"

/**
 * French national public holidays ("jours fériés"), computed for any year.
 * Names are i18n keys under `Employee.holidays.<key>`.
 */
export type HolidayKey =
  | "newYear"
  | "easterMonday"
  | "labourDay"
  | "victoryDay"
  | "ascension"
  | "whitMonday"
  | "bastilleDay"
  | "assumption"
  | "allSaints"
  | "armistice"
  | "christmas"

/**
 * Easter Sunday as a date key, using the Anonymous Gregorian (Meeus/Jones/
 * Butcher) computus — valid for any Gregorian year.
 */
export function easterSundayKey(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** All French public holidays of `year`, keyed by "YYYY-MM-DD". */
export function frenchHolidays(year: number): Map<string, HolidayKey> {
  const easter = easterSundayKey(year)
  const holidays = new Map<string, HolidayKey>([
    [`${year}-01-01`, "newYear"],
    [addDaysToKey(easter, 1), "easterMonday"],
    [`${year}-05-01`, "labourDay"],
    [`${year}-05-08`, "victoryDay"],
    [addDaysToKey(easter, 39), "ascension"],
    [addDaysToKey(easter, 50), "whitMonday"],
    [`${year}-07-14`, "bastilleDay"],
    [`${year}-08-15`, "assumption"],
    [`${year}-11-01`, "allSaints"],
    [`${year}-11-11`, "armistice"],
    [`${year}-12-25`, "christmas"],
  ])
  return holidays
}

/** Holidays for every year touched by [startKey, endKey]. */
export function holidaysInRange(
  startKey: string,
  endKey: string
): Map<string, HolidayKey> {
  const startYear = Number(startKey.slice(0, 4))
  const endYear = Number(endKey.slice(0, 4))
  const result = new Map<string, HolidayKey>()
  for (let year = startYear; year <= endYear; year++) {
    for (const [key, value] of frenchHolidays(year)) {
      if (key >= startKey && key <= endKey) result.set(key, value)
    }
  }
  return result
}

/** A working day is a weekday that is not a French public holiday. */
export function isWorkingDayKey(
  key: string,
  holidays: Map<string, HolidayKey>
): boolean {
  return !isWeekendKey(key) && !holidays.has(key)
}
