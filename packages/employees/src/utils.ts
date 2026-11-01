import { addDaysToKey, eachDateKey, round2, startOfWeekKey } from "./date-utils"
import { holidaysInRange, isWorkingDayKey } from "./holidays"
import type {
  AttendanceEntryData,
  DayPeriod,
  LeaveRequestData,
  LeaveStatus,
} from "./types"
import { DAY_PERIODS } from "./types"

const PERIOD_INDEX: Record<DayPeriod, number> = { morning: 0, afternoon: 1 }

/**
 * Working halves ("YYYY-MM-DD:period") covered by a half-day-precise range,
 * excluding weekends and French public holidays.
 */
export function halfKeysBetween(
  startKey: string,
  startPeriod: DayPeriod,
  endKey: string,
  endPeriod: DayPeriod
): string[] {
  const holidays = holidaysInRange(startKey, endKey)
  const keys: string[] = []
  for (const key of eachDateKey(startKey, endKey)) {
    if (!isWorkingDayKey(key, holidays)) continue
    for (const period of DAY_PERIODS) {
      if (
        key === startKey &&
        PERIOD_INDEX[period] < PERIOD_INDEX[startPeriod]
      ) {
        continue
      }
      if (key === endKey && PERIOD_INDEX[period] > PERIOD_INDEX[endPeriod]) {
        continue
      }
      keys.push(halfKey(key, period))
    }
  }
  return keys
}

/** Trim float noise from hour totals (7.499999 -> "7.5"). */
export function formatHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toString()
}

/** Hours worked in a full day for a contract. */
export function dailyHours(weeklyHours: number): number {
  return weeklyHours / 5
}

/** Hours represented by one allocated half-day. */
export function halfDayHours(weeklyHours: number): number {
  return weeklyHours / 10
}

export function halfKey(date: string, period: DayPeriod): string {
  return `${date}:${period}`
}

/** Map of `${userId}|${date}:${period}` -> entry, for O(1) lookups. */
export function entryIndex(
  entries: AttendanceEntryData[]
): Map<string, AttendanceEntryData> {
  const map = new Map<string, AttendanceEntryData>()
  for (const entry of entries) {
    map.set(`${entry.userId}|${halfKey(entry.date, entry.period)}`, entry)
  }
  return map
}

export function entryOn(
  index: Map<string, AttendanceEntryData>,
  userId: string,
  date: string,
  period: DayPeriod
): AttendanceEntryData | undefined {
  return index.get(`${userId}|${halfKey(date, period)}`)
}

/** Half-day keys ("YYYY-MM-DD:period") of working halves in a range. */
export function workingHalvesInRange(
  startKey: string,
  endKey: string
): string[] {
  const holidays = holidaysInRange(startKey, endKey)
  const halves: string[] = []
  for (const key of eachDateKey(startKey, endKey)) {
    if (!isWorkingDayKey(key, holidays)) continue
    halves.push(halfKey(key, "morning"), halfKey(key, "afternoon"))
  }
  return halves
}

/** Working days (Mon-Fri, excluding French public holidays) in a range. */
export function workingDaysInRange(startKey: string, endKey: string): number {
  const holidays = holidaysInRange(startKey, endKey)
  let count = 0
  for (const key of eachDateKey(startKey, endKey)) {
    if (isWorkingDayKey(key, holidays)) count += 1
  }
  return count
}

export function coversDate(
  request: LeaveRequestData,
  dateKey: string
): boolean {
  return request.startDate <= dateKey && request.endDate >= dateKey
}

/**
 * The most relevant leave status for `userId` on `dateKey`, preferring
 * approved over pending. Used to render calendar cells before the approved
 * leave is materialized as attendance.
 */
export function leaveStatusOnDate(
  requests: LeaveRequestData[],
  userId: string,
  dateKey: string
): LeaveStatus | undefined {
  let pending: LeaveStatus | undefined
  for (const request of requests) {
    if (request.userId !== userId || !coversDate(request, dateKey)) continue
    if (request.status === "approved") return "approved"
    if (request.status === "pending") pending = "pending"
  }
  return pending
}

/** Monday keys for `count` consecutive weeks starting at `todayKey`'s week. */
export function weekStartsFrom(
  todayKey: string,
  count: number,
  offset = 0
): string[] {
  const first = addDaysToKey(startOfWeekKey(todayKey), offset * 7)
  return Array.from({ length: count }, (_, index) =>
    addDaysToKey(first, index * 7)
  )
}

export function sum(values: number[]): number {
  return round2(values.reduce((total, value) => total + value, 0))
}
