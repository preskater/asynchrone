import {
  addDaysToKey,
  eachDateKey,
  monthDateRange,
  monthKeyOf,
  round2,
  startOfWeekKey,
} from "./date-utils"
import { holidaysInRange, isWorkingDayKey } from "./holidays"
import {
  isAbsenceStatus,
  type AttendanceEntryData,
  type CapacityUserRow,
  type CapacityWeek,
  type EmployeeMemberData,
} from "./types"
import { halfDayHours, sum } from "./utils"

/**
 * Pure capacity math, shared by the dashboard, alerts and CSV exports.
 *
 *   available = theoretical hours (weekly hours x working days / 5)
 *             - half-days marked with an absence status
 *   allocated = half-days linked to a project or internal activity
 *   remaining = available - allocated
 *
 * Absences only reduce availability when they fall on working days (Mon-Fri,
 * excluding French public holidays); allocations count on any day (weekend
 * work is real work and surfaces as a negative remaining capacity).
 */
export function computeCapacityRows(
  members: EmployeeMemberData[],
  entries: AttendanceEntryData[],
  startKey: string,
  endKey: string
): CapacityUserRow[] {
  const holidays = holidaysInRange(startKey, endKey)
  let workingDays = 0
  for (const key of eachDateKey(startKey, endKey)) {
    if (isWorkingDayKey(key, holidays)) workingDays += 1
  }

  const byUser = new Map<string, AttendanceEntryData[]>()
  for (const entry of entries) {
    if (entry.date < startKey || entry.date > endKey) continue
    const list = byUser.get(entry.userId) ?? []
    list.push(entry)
    byUser.set(entry.userId, list)
  }

  return members
    .filter((member) => member.profile.isActive)
    .map((member) => {
      const hoursPerHalf = halfDayHours(member.profile.weeklyHours)
      const own = byUser.get(member.id) ?? []
      const absenceHalves = own.filter(
        (entry) =>
          isAbsenceStatus(entry.status) && isWorkingDayKey(entry.date, holidays)
      ).length
      const allocatedHalves = own.filter(
        (entry) =>
          !isAbsenceStatus(entry.status) &&
          Boolean(entry.projectId ?? entry.internalActivityId)
      ).length
      const availableHours = round2(
        workingDays * 2 * hoursPerHalf - absenceHalves * hoursPerHalf
      )
      const allocatedHours = round2(allocatedHalves * hoursPerHalf)
      return {
        userId: member.id,
        userName: member.name,
        weeklyHours: member.profile.weeklyHours,
        availableHours,
        allocatedHours,
        remainingHours: round2(availableHours - allocatedHours),
      }
    })
}

export function computeCapacityTotals(rows: CapacityUserRow[]) {
  return {
    availableHours: sum(rows.map((row) => row.availableHours)),
    allocatedHours: sum(rows.map((row) => row.allocatedHours)),
    remainingHours: sum(rows.map((row) => row.remainingHours)),
  }
}

/** `count` consecutive weeks starting from the week containing `todayKey`. */
export function computeCapacityWeeks(
  members: EmployeeMemberData[],
  entries: AttendanceEntryData[],
  todayKey: string,
  count = 5
): CapacityWeek[] {
  const firstMonday = startOfWeekKey(todayKey)
  return Array.from({ length: count }, (_, index) => {
    const weekStart = addDaysToKey(firstMonday, index * 7)
    const weekEnd = addDaysToKey(weekStart, 6)
    const rows = computeCapacityRows(members, entries, weekStart, weekEnd)
    return { weekStart, rows, totals: computeCapacityTotals(rows) }
  })
}

/** Capacity for the calendar month containing `todayKey`. */
export function computeCapacityMonth(
  members: EmployeeMemberData[],
  entries: AttendanceEntryData[],
  todayKey: string
): { rows: CapacityUserRow[]; totals: CapacityWeek["totals"] } {
  const { start, end } = monthDateRange(monthKeyOf(todayKey))
  const rows = computeCapacityRows(members, entries, start, end)
  return { rows, totals: computeCapacityTotals(rows) }
}
