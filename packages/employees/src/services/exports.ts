import type { RequestContext } from "@workspace/core/context"
import { ValidationError } from "@workspace/core/errors"
import {
  addDaysToKey,
  monthDateRange,
  monthKeyOf,
  parseDateKey,
  round2,
  startOfWeekKey,
  toDateKey,
} from "../date-utils"
import type { EmployeeAccess } from "../access"
import { computeCapacityWeeks } from "../capacity"
import { toCsv, type CsvFile } from "../csv"
import type { ExportInput } from "../schemas"
import { halfDayHours } from "../utils"
import { EmployeesServiceCore, requireAdmin } from "./core"

export class EmployeeExportsService extends EmployeesServiceCore {
  async exportCsv(ctx: RequestContext, input: ExportInput): Promise<CsvFile> {
    const access = await this.accessFor(ctx)
    const todayKey = toDateKey(new Date())
    const monthRange = monthDateRange(monthKeyOf(todayKey))

    if (input.report === "audit" && !access.isAdmin) {
      requireAdmin(access)
    }

    switch (input.report) {
      case "attendance":
        return this.exportAttendance(ctx, access, input, monthRange)
      case "leave":
        return this.exportLeave(ctx, access, todayKey)
      case "project-time":
        return this.exportTime(ctx, access, todayKey, "project")
      case "client-time":
        return this.exportTime(ctx, access, todayKey, "client")
      case "capacity":
        return this.exportCapacity(ctx, access, todayKey)
      case "payroll":
        return this.exportPayroll(
          ctx,
          access,
          input.month ?? monthKeyOf(todayKey)
        )
      case "audit":
        return this.exportAudit(ctx)
      default:
        throw new ValidationError("Unknown report.")
    }
  }

  private async exportAttendance(
    ctx: RequestContext,
    access: EmployeeAccess,
    input: ExportInput,
    defaultRange: { start: string; end: string }
  ): Promise<CsvFile> {
    const range =
      input.from && input.to
        ? { start: input.from, end: input.to }
        : defaultRange
    const [rows, memberInfo, clientRows, activityRows, projectRows] =
      await Promise.all([
        this.repo.listAttendance(
          ctx.organizationId,
          parseDateKey(range.start),
          parseDateKey(range.end)
        ),
        this.loadMembers(ctx.organizationId),
        this.repo.listClients(ctx.organizationId),
        this.repo.listActivities(ctx.organizationId),
        this.repo.listProjects(ctx.organizationId),
      ])
    const clientById = new Map(clientRows.map((row) => [row.id, row.name]))
    const activityById = new Map(activityRows.map((row) => [row.id, row.name]))
    const projectById = new Map(projectRows.map((row) => [row.id, row]))

    const csvRows: (string | number)[][] = [
      [
        "Date",
        "User",
        "Period",
        "Status",
        "Location",
        "Project",
        "Client",
        "Internal activity",
        "Billable",
        "Comment",
      ],
    ]
    for (const row of rows) {
      if (!access.canViewAll && row.userId !== ctx.userId) continue
      const project = row.projectId ? projectById.get(row.projectId) : undefined
      csvRows.push([
        toDateKey(row.date),
        memberInfo.nameById.get(row.userId) ?? row.userId,
        row.period,
        row.status,
        row.location ?? "",
        project?.name ?? "",
        project?.clientId ? (clientById.get(project.clientId) ?? "") : "",
        row.internalActivityId
          ? (activityById.get(row.internalActivityId) ?? "")
          : "",
        row.isBillable ? "yes" : "no",
        row.comment ?? "",
      ])
    }
    return {
      filename: `asynchrone-space-attendance-${range.start}-${range.end}.csv`,
      content: toCsv(csvRows),
    }
  }

  private async exportLeave(
    ctx: RequestContext,
    access: EmployeeAccess,
    todayKey: string
  ): Promise<CsvFile> {
    const [rows, nameById] = await Promise.all([
      this.repo.listLeaveRequests(ctx.organizationId),
      this.namesById(ctx.organizationId),
    ])
    const csvRows: (string | number)[][] = [
      [
        "User",
        "Type",
        "Status",
        "Start",
        "Start half",
        "End",
        "End half",
        "Half-days",
        "Comment",
        "Validator",
        "Decision date",
        "Decision comment",
      ],
    ]
    for (const row of rows) {
      if (!access.canViewAll && row.userId !== ctx.userId) continue
      csvRows.push([
        nameById.get(row.userId) ?? row.userId,
        row.type,
        row.status,
        toDateKey(row.startDate),
        row.startPeriod,
        toDateKey(row.endDate),
        row.endPeriod,
        row.halfDays,
        row.comment ?? "",
        row.validatorId ? (nameById.get(row.validatorId) ?? "") : "",
        row.decisionDate ? toDateKey(row.decisionDate) : "",
        row.decisionComment ?? "",
      ])
    }
    return {
      filename: `asynchrone-space-leave-${todayKey}.csv`,
      content: toCsv(csvRows),
    }
  }

  private async exportTime(
    ctx: RequestContext,
    access: EmployeeAccess,
    todayKey: string,
    group: "project" | "client"
  ): Promise<CsvFile> {
    const weekStart = startOfWeekKey(todayKey)
    const weekEnd = addDaysToKey(weekStart, 6)
    const monthRange = monthDateRange(monthKeyOf(todayKey))

    const [rows, memberInfo, projectRows, clientRows] = await Promise.all([
      this.repo.listAllocationEntries(ctx.organizationId),
      this.loadMembers(ctx.organizationId),
      this.repo.listProjects(ctx.organizationId),
      this.repo.listClients(ctx.organizationId),
    ])
    const memberById = new Map(memberInfo.members.map((m) => [m.id, m]))
    const projectById = new Map(projectRows.map((row) => [row.id, row]))
    const clientById = new Map(clientRows.map((row) => [row.id, row.name]))

    type Bucket = { week: number; month: number; total: number }
    const buckets = new Map<string, Bucket>()
    for (const row of rows) {
      if (!access.canViewAll && row.userId !== ctx.userId) continue
      const user = memberById.get(row.userId)
      const hours = halfDayHours(user?.profile.weeklyHours ?? 35)
      const dateKey = toDateKey(row.date)
      const project = row.projectId ? projectById.get(row.projectId) : undefined
      const label =
        group === "project"
          ? (project?.name ?? "—")
          : project?.clientId
            ? (clientById.get(project.clientId) ?? "—")
            : "— (no client)"
      const key = `${row.userId}|${label}`
      const bucket = buckets.get(key) ?? { week: 0, month: 0, total: 0 }
      bucket.total = round2(bucket.total + hours)
      if (dateKey >= weekStart && dateKey <= weekEnd) {
        bucket.week = round2(bucket.week + hours)
      }
      if (dateKey >= monthRange.start && dateKey <= monthRange.end) {
        bucket.month = round2(bucket.month + hours)
      }
      buckets.set(key, bucket)
    }

    const header =
      group === "project"
        ? [
            "User",
            "Project",
            "Hours this week",
            "Hours this month",
            "Hours since start",
          ]
        : [
            "User",
            "Client",
            "Hours this week",
            "Hours this month",
            "Hours since start",
          ]
    const csvRows: (string | number)[][] = [header]
    for (const [key, bucket] of buckets) {
      const [userId = "", label = ""] = key.split("|")
      csvRows.push([
        memberById.get(userId)?.name ?? userId,
        label,
        bucket.week,
        bucket.month,
        bucket.total,
      ])
    }
    return {
      filename: `asynchrone-space-${group}-time-${todayKey}.csv`,
      content: toCsv(csvRows),
    }
  }

  private async exportCapacity(
    ctx: RequestContext,
    access: EmployeeAccess,
    todayKey: string
  ): Promise<CsvFile> {
    const memberInfo = await this.loadMembers(ctx.organizationId)
    const scopeMembers = access.canViewAll
      ? memberInfo.members
      : memberInfo.members.filter((member) => member.id === ctx.userId)

    const rangeStart = startOfWeekKey(todayKey)
    const rangeEnd = addDaysToKey(rangeStart, 5 * 7 - 1)
    const rows = await this.repo.listAttendance(
      ctx.organizationId,
      parseDateKey(rangeStart),
      parseDateKey(rangeEnd)
    )
    const entries = rows.map((row) =>
      this.mapAttendance(row, false, ctx.userId)
    )
    const weeks = computeCapacityWeeks(scopeMembers, entries, todayKey, 5)

    const csvRows: (string | number)[][] = [
      ["Week", "User", "Weekly hours", "Available", "Allocated", "Remaining"],
    ]
    for (const week of weeks) {
      for (const row of week.rows) {
        csvRows.push([
          week.weekStart,
          row.userName,
          row.weeklyHours,
          row.availableHours,
          row.allocatedHours,
          row.remainingHours,
        ])
      }
    }
    return {
      filename: `asynchrone-space-capacity-${todayKey}.csv`,
      content: toCsv(csvRows),
    }
  }

  private async exportPayroll(
    ctx: RequestContext,
    access: EmployeeAccess,
    monthKey: string
  ): Promise<CsvFile> {
    requireAdmin(access)
    const payroll = await this.getPayroll(ctx, monthKey)
    const csvRows: (string | number)[][] = [
      [
        "Worker",
        "Type",
        "Worked hours",
        "Hourly wage",
        "Gross total",
        "Employee contributions",
        "Employer contributions",
        "Net before tax",
        "Total cost",
      ],
    ]
    for (const row of payroll.rows) {
      csvRows.push([
        row.userName,
        row.salaryType,
        row.workedHours,
        row.hourlyRate,
        row.grossPay,
        row.employeeContribution,
        row.employerContribution,
        row.netBeforeTax,
        row.totalCost,
      ])
    }
    csvRows.push([
      "Total",
      "",
      payroll.totals.workedHours,
      "",
      payroll.totals.grossPay,
      payroll.totals.employeeContribution,
      payroll.totals.employerContribution,
      payroll.totals.netBeforeTax,
      payroll.totals.totalCost,
    ])
    return {
      filename: `asynchrone-space-payroll-${monthKey}.csv`,
      content: toCsv(csvRows),
    }
  }

  private async exportAudit(ctx: RequestContext): Promise<CsvFile> {
    const [rows, nameById] = await Promise.all([
      this.repo.listAudit(ctx.organizationId, 500),
      this.namesById(ctx.organizationId),
    ])
    const csvRows: (string | number)[][] = [
      ["Date", "Actor", "Action", "Entity type", "Entity id"],
    ]
    for (const row of rows) {
      csvRows.push([
        row.createdAt.toISOString(),
        nameById.get(row.actorId) ?? row.actorId,
        row.action,
        row.entityType,
        row.entityId,
      ])
    }
    return {
      filename: `asynchrone-space-audit-${toDateKey(new Date())}.csv`,
      content: toCsv(csvRows),
    }
  }
}
