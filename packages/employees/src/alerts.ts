import { addDaysToKey, eachDateKey, round2, startOfWeekKey } from "./date-utils"
import { holidaysInRange, isWorkingDayKey } from "./holidays"
import type {
  AlertData,
  AttendanceEntryData,
  CapacityUserRow,
  EmployeeMemberData,
  EmployeeSettingsData,
  LeaveBalanceData,
  LeaveRequestData,
} from "./types"
import { isAbsenceStatus, isWorkingStatus } from "./types"
import { halfKey } from "./utils"

export interface BuildAlertsInput {
  todayKey: string
  /** Members in scope (active ones are checked). */
  members: EmployeeMemberData[]
  /** Attendance in a window covering [today - 7d, next week end]. */
  entries: AttendanceEntryData[]
  currentWeekRows: CapacityUserRow[]
  /** Leave requests in scope (all statuses). */
  leaveRequests: LeaveRequestData[]
  /** Balances in scope for the current year. */
  balances: LeaveBalanceData[]
  settings: EmployeeSettingsData
  projectTotals: {
    projectId: string
    projectName: string
    allocatedHours: number
    plannedHours?: number
  }[]
}

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 } as const

/**
 * Non-blocking dashboard warnings: unallocated working time, overallocation,
 * low balances, stale pending requests, project overruns and missing
 * attendance records.
 */
export function buildAlerts(input: BuildAlertsInput): AlertData[] {
  const {
    todayKey,
    members,
    entries,
    currentWeekRows,
    leaveRequests,
    balances,
    settings,
    projectTotals,
  } = input

  const alerts: AlertData[] = []
  const activeMembers = members.filter((member) => member.profile.isActive)
  const activeIds = new Set(activeMembers.map((member) => member.id))
  const entryIndex = new Set(
    entries.map(
      (entry) => `${entry.userId}|${halfKey(entry.date, entry.period)}`
    )
  )

  const weekStart = startOfWeekKey(todayKey)
  const nextWeekEnd = addDaysToKey(weekStart, 13)
  const holidays = holidaysInRange(todayKey, nextWeekEnd)

  // --- no_allocation: declared working halves without project/activity ------
  for (const member of activeMembers) {
    const count = entries.filter(
      (entry) =>
        entry.userId === member.id &&
        entry.date >= weekStart &&
        entry.date <= nextWeekEnd &&
        !isAbsenceStatus(entry.status) &&
        isWorkingStatus(entry.status) &&
        !entry.projectId &&
        !entry.internalActivityId
    ).length
    if (count > 0) {
      alerts.push({
        id: `no_allocation:${member.id}`,
        kind: "no_allocation",
        severity: "info",
        userId: member.id,
        userName: member.name,
        count,
        tab: "calendar",
      })
    }
  }

  // --- overallocated: negative remaining capacity this week -----------------
  for (const row of currentWeekRows) {
    if (row.remainingHours >= 0) continue
    alerts.push({
      id: `overallocated:${row.userId}`,
      kind: "overallocated",
      severity: "warning",
      userId: row.userId,
      userName: row.userName,
      hours: Math.abs(row.remainingHours),
      tab: "capacity",
    })
  }

  // --- low (or negative) paid-leave balance ---------------------------------
  for (const balance of balances) {
    if (balance.leaveType !== "paid_leave") continue
    if (!activeIds.has(balance.userId)) continue
    if (balance.remainingDays < 0) {
      alerts.push({
        id: `low_balance:${balance.userId}`,
        kind: "low_balance",
        severity: "critical",
        userId: balance.userId,
        userName: balance.userName,
        days: balance.remainingDays,
        tab: "leave",
      })
    } else if (balance.remainingDays < settings.lowBalanceThreshold) {
      alerts.push({
        id: `low_balance:${balance.userId}`,
        kind: "low_balance",
        severity: "warning",
        userId: balance.userId,
        userName: balance.userName,
        days: balance.remainingDays,
        tab: "leave",
      })
    }
  }

  // --- pending_validation: requests waiting longer than the threshold -------
  const staleBefore = addDaysToKey(todayKey, -settings.pendingValidationDays)
  const staleCount = leaveRequests.filter(
    (request) =>
      request.status === "pending" &&
      request.createdAt.slice(0, 10) < staleBefore
  ).length
  if (staleCount > 0) {
    alerts.push({
      id: "pending_validation",
      kind: "pending_validation",
      severity: "warning",
      count: staleCount,
      tab: "leave",
    })
  }

  // --- project_overrun: actual allocation above planned hours ---------------
  for (const project of projectTotals) {
    if (project.plannedHours === undefined || project.plannedHours <= 0)
      continue
    if (project.allocatedHours <= project.plannedHours) continue
    const critical = project.allocatedHours >= project.plannedHours * 1.2
    alerts.push({
      id: `project_overrun:${project.projectId}`,
      kind: "project_overrun",
      severity: critical ? "critical" : "warning",
      projectId: project.projectId,
      projectName: project.projectName,
      hours: round2(project.allocatedHours),
      plannedHours: round2(project.plannedHours),
      tab: "tracking",
    })
  }

  // --- missing_attendance: past working halves with no record ---------------
  const missingFrom = addDaysToKey(todayKey, -7)
  const missingTo = addDaysToKey(todayKey, -1)
  const missingHolidays = holidaysInRange(missingFrom, todayKey)
  for (const member of activeMembers) {
    let count = 0
    for (const key of eachDateKey(missingFrom, missingTo)) {
      if (!isWorkingDayKey(key, missingHolidays)) continue
      for (const period of ["morning", "afternoon"] as const) {
        if (!entryIndex.has(`${member.id}|${halfKey(key, period)}`)) count += 1
      }
    }
    if (count >= 2) {
      alerts.push({
        id: `missing_attendance:${member.id}`,
        kind: "missing_attendance",
        severity: "info",
        userId: member.id,
        userName: member.name,
        count,
        tab: "calendar",
      })
    }
  }

  return alerts.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.kind.localeCompare(b.kind)
  )
}
