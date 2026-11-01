import type { RequestContext } from "@workspace/core/context"
import {
  addMonthsToKey,
  monthDateRange,
  parseDateKey,
  round2,
  toDateKey,
} from "../date-utils"
import { buildAlerts } from "../alerts"
import { computeCapacityMonth, computeCapacityWeeks } from "../capacity"
import {
  TRACKED_LEAVE_TYPES,
  type EmployeeMemberData,
  type EmployeeOverviewData,
  type EmployeeSettingsData,
  type LeaveBalanceData,
} from "../types"
import { halfDayHours } from "../utils"
import {
  EmployeesServiceCore,
  type LeaveRow,
  type BalanceRow,
  type AdjustmentRow,
  type ProjectRow,
  type AllocationRow,
} from "./core"

export class EmployeeOverviewService extends EmployeesServiceCore {
  async getOverview(ctx: RequestContext): Promise<EmployeeOverviewData> {
    const todayKey = toDateKey(new Date())
    const year = Number(todayKey.slice(0, 4))
    const monthKey = todayKey.slice(0, 7)
    const rangeStart = monthDateRange(addMonthsToKey(monthKey, -1)).start
    const rangeEnd = monthDateRange(addMonthsToKey(monthKey, 2)).end

    const access = await this.accessFor(ctx)

    const [
      memberInfo,
      attendanceRows,
      leaveRows,
      balanceRows,
      adjustmentRows,
      clientRows,
      activityRows,
      projectRows,
      allocationRows,
      salaryRows,
      auditRows,
    ] = await Promise.all([
      this.loadMembers(ctx.organizationId),
      this.repo.listAttendance(
        ctx.organizationId,
        parseDateKey(rangeStart),
        parseDateKey(rangeEnd)
      ),
      this.repo.listLeaveRequests(ctx.organizationId, {
        from: parseDateKey(`${year - 1}-01-01`),
      }),
      this.repo.listBalances(ctx.organizationId, year),
      this.repo.listAdjustments(ctx.organizationId, year),
      this.repo.listClients(ctx.organizationId),
      this.repo.listActivities(ctx.organizationId),
      this.repo.listProjects(ctx.organizationId),
      // Project totals only need the current year; unbounded allocations made
      // the overview grow with every tracked half-day ever recorded.
      this.repo.listAllocationEntries(ctx.organizationId, {
        from: parseDateKey(`${year}-01-01`),
        to: parseDateKey(rangeEnd),
      }),
      access.isAdmin ? this.repo.listSalaryProfiles(ctx.organizationId) : [],
      access.isAdmin ? this.repo.listAudit(ctx.organizationId, 100) : [],
    ])

    const { members, nameById, settings } = memberInfo
    const myProfile =
      members.find((member) => member.id === ctx.userId)?.profile ??
      this.mapProfile(undefined, settings)

    const scopeMembers = access.canViewAll
      ? members
      : members.filter((member) => member.id === ctx.userId)

    const attendance = attendanceRows.map((row) =>
      this.mapAttendance(row, !access.canViewAll, ctx.userId)
    )
    const leaveRequests = leaveRows
      .filter((row) => access.canViewAll || row.userId === ctx.userId)
      .map((row) => this.mapLeave(row, nameById))
    const pendingApprovals = leaveRows
      .filter(
        (row) =>
          row.status === "pending" &&
          (access.canViewAll || row.userId === ctx.userId)
      )
      .map((row) => this.mapLeave(row, nameById))

    const balances = this.computeBalances({
      members: scopeMembers,
      balanceRows,
      adjustmentRows,
      leaveRows,
      settings,
      year,
      nameById,
    })
    const adjustments = adjustmentRows
      .filter((row) => access.canViewAll || row.userId === ctx.userId)
      .map((row) => this.mapAdjustment(row, nameById))

    const capacityWeeks = computeCapacityWeeks(
      scopeMembers,
      attendance,
      todayKey,
      5
    )
    const capacityMonth = computeCapacityMonth(
      scopeMembers,
      attendance,
      todayKey
    )

    const projectTotals = this.buildProjectTotals(
      allocationRows,
      members,
      projectRows
    )
    const alerts = buildAlerts({
      todayKey,
      members: scopeMembers,
      entries: attendance,
      currentWeekRows: capacityWeeks[0]?.rows ?? [],
      leaveRequests,
      balances,
      settings,
      projectTotals,
    })

    const payroll = access.isAdmin
      ? this.computePayroll(members, salaryRows, settings, attendance, monthKey)
      : null

    return {
      todayKey,
      year,
      currentUserId: ctx.userId,
      access: {
        isAdmin: access.isAdmin,
        isValidator: access.isValidator,
        canViewAll: access.canViewAll,
        canTrack: access.canTrack,
      },
      settings,
      members,
      myProfile,
      attendance,
      attendanceRange: { start: rangeStart, end: rangeEnd },
      leaveRequests,
      pendingApprovals,
      balances,
      adjustments,
      capacityWeeks,
      capacityMonth,
      alerts,
      payroll,
      clients: clientRows.map((row) => this.mapClient(row)),
      activities: activityRows.map((row) => this.mapActivity(row)),
      projects: projectRows.map((row) => this.mapProject(row)),
      audit: auditRows.map((row) => this.mapAudit(row, nameById)),
    }
  }

  private computeBalances(args: {
    members: EmployeeMemberData[]
    balanceRows: BalanceRow[]
    adjustmentRows: AdjustmentRow[]
    leaveRows: LeaveRow[]
    settings: EmployeeSettingsData
    year: number
    nameById: Map<string, string>
  }): LeaveBalanceData[] {
    const {
      members,
      balanceRows,
      adjustmentRows,
      leaveRows,
      settings,
      year,
      nameById,
    } = args

    const balanceKey = (userId: string, leaveType: string) =>
      `${userId}|${leaveType}`
    const byKey = new Map(
      balanceRows.map((row) => [balanceKey(row.userId, row.leaveType), row])
    )
    const adjustments = new Map<string, number>()
    for (const row of adjustmentRows) {
      const key = balanceKey(row.userId, row.leaveType)
      adjustments.set(key, (adjustments.get(key) ?? 0) + row.days)
    }

    const used = new Map<string, number>()
    const pending = new Map<string, number>()
    for (const row of leaveRows) {
      if (Number(toDateKey(row.startDate).slice(0, 4)) !== year) continue
      if (row.type === "sick") continue // illness does not consume a balance
      const key = balanceKey(row.userId, row.type)
      if (row.status === "approved") {
        used.set(key, (used.get(key) ?? 0) + row.halfDays)
      } else if (row.status === "pending") {
        pending.set(key, (pending.get(key) ?? 0) + row.halfDays)
      }
    }

    const result: LeaveBalanceData[] = []
    for (const member of members) {
      for (const leaveType of TRACKED_LEAVE_TYPES) {
        const key = balanceKey(member.id, leaveType)
        const balanceRow = byKey.get(key)
        const allowanceDays =
          balanceRow?.allowanceDays ??
          (leaveType === "paid_leave" ? settings.defaultAllowanceDays : 0)
        const adjustmentDays = round2(adjustments.get(key) ?? 0)
        const acquiredDays = round2(allowanceDays + adjustmentDays)
        const usedDays = round2((used.get(key) ?? 0) / 2)
        const pendingDays = round2((pending.get(key) ?? 0) / 2)
        result.push({
          userId: member.id,
          userName: nameById.get(member.id) ?? member.name,
          leaveType,
          year,
          allowanceDays,
          adjustmentDays,
          acquiredDays,
          usedDays,
          pendingDays,
          remainingDays: round2(acquiredDays - usedDays),
          expiresAt: balanceRow?.expiresAt?.toISOString(),
        })
      }
    }
    return result
  }

  private buildProjectTotals(
    allocationRows: AllocationRow[],
    members: EmployeeMemberData[],
    projectRows: ProjectRow[]
  ) {
    const hoursByUser = new Map(
      members.map((member) => [
        member.id,
        halfDayHours(member.profile.weeklyHours),
      ])
    )
    const byProject = new Map<string, number>()
    for (const row of allocationRows) {
      if (!row.projectId) continue
      const hours = hoursByUser.get(row.userId) ?? halfDayHours(35)
      byProject.set(row.projectId, (byProject.get(row.projectId) ?? 0) + hours)
    }
    return projectRows
      .filter((project) => byProject.has(project.id))
      .map((project) => ({
        projectId: project.id,
        projectName: project.name,
        allocatedHours: round2(byProject.get(project.id) ?? 0),
        plannedHours: project.plannedHours ?? undefined,
      }))
  }
}
