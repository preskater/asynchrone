import type { RequestContext } from "@workspace/core/context"
import { ForbiddenError, ValidationError } from "@workspace/core/errors"
import {
  isMonthKey,
  monthDateRange,
  parseDateKey,
  round2,
  toDateKey,
} from "../date-utils"
import { resolveEmployeeAccess, type EmployeeAccess } from "../access"
import type { EmployeesRepository } from "../repository"
import {
  isWorkingStatus,
  type AttendanceEntryData,
  type AttendanceStatus,
  type AuditLogData,
  type BalanceType,
  type ClientData,
  type DayPeriod,
  type EmployeeMemberData,
  type EmployeeProfileData,
  type EmployeeSettingsData,
  type InternalActivityData,
  type LeaveAdjustmentData,
  type LeaveRequestData,
  type LeaveType,
  type PayrollData,
  type ProjectOptionData,
  type SalaryType,
  type WorkLocationKind,
} from "../types"
import { halfDayHours, sum } from "../utils"

export const DEFAULT_SETTINGS: EmployeeSettingsData = {
  defaultWeeklyHours: 35,
  defaultAllowanceDays: 25,
  lowBalanceThreshold: 5,
  pendingValidationDays: 3,
  defaultEmployeeRate: 22,
  defaultEmployerRate: 42,
}

export function requireTrack(access: EmployeeAccess) {
  if (access.canTrack) return
  throw new ForbiddenError("Your role cannot update attendance.", {
    code: "role_cannot_modify_employees",
  })
}

export function requireValidator(access: EmployeeAccess) {
  if (access.isValidator) return
  throw new ForbiddenError("Your role cannot manage leave requests.", {
    code: "role_cannot_manage_employees",
  })
}

export function requireAdmin(access: EmployeeAccess) {
  if (access.isAdmin) return
  throw new ForbiddenError("Your role cannot manage employee settings.", {
    code: "role_cannot_manage_employees",
  })
}

export type MemberRow = Awaited<
  ReturnType<EmployeesRepository["listMembers"]>
>[number]
export type ProfileRow = Awaited<
  ReturnType<EmployeesRepository["listProfiles"]>
>[number]
export type AttendanceRow = Awaited<
  ReturnType<EmployeesRepository["listAttendance"]>
>[number]
export type LeaveRow = Awaited<
  ReturnType<EmployeesRepository["listLeaveRequests"]>
>[number]
export type BalanceRow = Awaited<
  ReturnType<EmployeesRepository["listBalances"]>
>[number]
export type AdjustmentRow = Awaited<
  ReturnType<EmployeesRepository["listAdjustments"]>
>[number]
export type ClientRow = Awaited<
  ReturnType<EmployeesRepository["listClients"]>
>[number]
export type ActivityRow = Awaited<
  ReturnType<EmployeesRepository["listActivities"]>
>[number]
export type ProjectRow = Awaited<
  ReturnType<EmployeesRepository["listProjects"]>
>[number]
export type AuditRow = Awaited<
  ReturnType<EmployeesRepository["listAudit"]>
>[number]
export type AllocationRow = Awaited<
  ReturnType<EmployeesRepository["listAllocationEntries"]>
>[number]
export type SalaryRow = Awaited<
  ReturnType<EmployeesRepository["listSalaryProfiles"]>
>[number]

export class EmployeesServiceCore {
  constructor(protected readonly repo: EmployeesRepository) {}

  protected mapProfile(
    profile: ProfileRow | undefined,
    settings: EmployeeSettingsData
  ): EmployeeProfileData {
    return {
      employmentType:
        (profile?.employmentType as EmployeeProfileData["employmentType"]) ??
        "employee",
      contractType:
        (profile?.contractType as EmployeeProfileData["contractType"]) ?? "cdi",
      weeklyHours: profile?.weeklyHours ?? settings.defaultWeeklyHours,
      managerId: profile?.managerId ?? undefined,
      isValidator: profile?.isValidator ?? false,
      isActive: profile?.isActive ?? true,
    }
  }

  protected mapMember(
    row: MemberRow,
    profileByUser: Map<string, ProfileRow>,
    settings: EmployeeSettingsData
  ): EmployeeMemberData {
    return {
      id: row.userId,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl ?? undefined,
      orgRole: row.role,
      profile: this.mapProfile(profileByUser.get(row.userId), settings),
    }
  }

  protected mapAttendance(
    row: AttendanceRow,
    maskOthers: boolean,
    viewerId: string
  ): AttendanceEntryData {
    const masked = maskOthers && row.userId !== viewerId
    return {
      id: row.id,
      userId: row.userId,
      date: toDateKey(row.date),
      period: row.period as DayPeriod,
      status: row.status as AttendanceStatus,
      location: (row.location as WorkLocationKind | null) ?? undefined,
      projectId: masked ? undefined : (row.projectId ?? undefined),
      internalActivityId: masked
        ? undefined
        : (row.internalActivityId ?? undefined),
      leaveRequestId: row.leaveRequestId ?? undefined,
      isBillable: masked ? false : row.isBillable,
      comment: masked ? undefined : (row.comment ?? undefined),
    }
  }

  protected mapLeave(
    row: LeaveRow,
    nameById: Map<string, string>
  ): LeaveRequestData {
    return {
      id: row.id,
      userId: row.userId,
      userName: nameById.get(row.userId) ?? "—",
      type: row.type as LeaveType,
      status: row.status as LeaveRequestData["status"],
      startDate: toDateKey(row.startDate),
      endDate: toDateKey(row.endDate),
      startPeriod: row.startPeriod as DayPeriod,
      endPeriod: row.endPeriod as DayPeriod,
      halfDays: row.halfDays,
      comment: row.comment ?? undefined,
      validatorId: row.validatorId ?? undefined,
      validatorName: row.validatorId
        ? nameById.get(row.validatorId)
        : undefined,
      decisionDate: row.decisionDate?.toISOString(),
      decisionComment: row.decisionComment ?? undefined,
      createdAt: row.createdAt.toISOString(),
    }
  }

  protected mapClient(row: ClientRow): ClientData {
    return {
      id: row.id,
      name: row.name,
      contactEmail: row.contactEmail ?? undefined,
      isActive: row.isActive,
    }
  }

  protected mapActivity(row: ActivityRow): InternalActivityData {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      kind: row.kind as InternalActivityData["kind"],
      isActive: row.isActive,
    }
  }

  protected mapProject(row: ProjectRow): ProjectOptionData {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      clientId: row.clientId ?? undefined,
      clientName: row.clientName ?? undefined,
      isBillable: row.isBillable,
      plannedHours: row.plannedHours ?? undefined,
      startDate: row.startDate ? toDateKey(row.startDate) : undefined,
      endDate: row.endDate ? toDateKey(row.endDate) : undefined,
    }
  }

  protected mapAudit(
    row: AuditRow,
    nameById: Map<string, string>
  ): AuditLogData {
    return {
      id: row.id,
      actorId: row.actorId,
      actorName: nameById.get(row.actorId) ?? "—",
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      createdAt: row.createdAt.toISOString(),
    }
  }

  protected async accessFor(ctx: RequestContext): Promise<EmployeeAccess> {
    const profile = await this.repo.findProfile(ctx.organizationId, ctx.userId)
    return resolveEmployeeAccess(ctx, profile?.isValidator ?? false)
  }

  protected async loadMembers(organizationId: string): Promise<{
    members: EmployeeMemberData[]
    nameById: Map<string, string>
    settings: EmployeeSettingsData
  }> {
    const [memberRows, profileRows, settingsRow] = await Promise.all([
      this.repo.listMembers(organizationId),
      this.repo.listProfiles(organizationId),
      this.repo.findSettings(organizationId),
    ])
    const settings: EmployeeSettingsData = settingsRow
      ? {
          defaultWeeklyHours: settingsRow.defaultWeeklyHours,
          defaultAllowanceDays: settingsRow.defaultAllowanceDays,
          lowBalanceThreshold: settingsRow.lowBalanceThreshold,
          pendingValidationDays: settingsRow.pendingValidationDays,
          defaultEmployeeRate: settingsRow.defaultEmployeeRate,
          defaultEmployerRate: settingsRow.defaultEmployerRate,
        }
      : DEFAULT_SETTINGS
    const profileByUser = new Map(profileRows.map((row) => [row.userId, row]))
    const members = memberRows.map((row) =>
      this.mapMember(row, profileByUser, settings)
    )
    return {
      members,
      nameById: new Map(members.map((member) => [member.id, member.name])),
      settings,
    }
  }

  protected mapAdjustment(
    row: AdjustmentRow,
    nameById: Map<string, string>
  ): LeaveAdjustmentData {
    return {
      id: row.id,
      userId: row.userId,
      userName: nameById.get(row.userId) ?? "—",
      leaveType: row.leaveType as BalanceType,
      year: row.year,
      days: row.days,
      note: row.note ?? undefined,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    }
  }

  protected async namesById(
    organizationId: string
  ): Promise<Map<string, string>> {
    const members = await this.repo.listMembers(organizationId)
    return new Map(members.map((row) => [row.userId, row.name]))
  }

  /**
   * Build one payroll line per member for a month: worked hours come from
   * attendance entries with a working status, money columns from the salary
   * profile (or the organization defaults) and the contribution rates.
   */
  protected computePayroll(
    members: EmployeeMemberData[],
    salaryRows: SalaryRow[],
    settings: EmployeeSettingsData,
    entries: AttendanceEntryData[],
    monthKey: string
  ): PayrollData {
    const salaryByUser = new Map(salaryRows.map((row) => [row.userId, row]))
    const rows = members.map((member) => {
      const salary = salaryByUser.get(member.id)
      const hourlyRate = salary?.hourlyRate ?? 0
      const employeeRate = salary?.employeeRate ?? settings.defaultEmployeeRate
      const employerRate = salary?.employerRate ?? settings.defaultEmployerRate
      const halfHours = halfDayHours(member.profile.weeklyHours)
      const workedHours = sum(
        entries
          .filter(
            (entry) =>
              entry.userId === member.id &&
              entry.date.slice(0, 7) === monthKey &&
              isWorkingStatus(entry.status)
          )
          .map(() => halfHours)
      )
      const grossPay = round2(workedHours * hourlyRate)
      const employeeContribution = round2((grossPay * employeeRate) / 100)
      const employerContribution = round2((grossPay * employerRate) / 100)
      return {
        userId: member.id,
        userName: member.name,
        salaryType: (salary?.salaryType ?? "full_time") as SalaryType,
        workedHours,
        hourlyRate,
        employeeRate,
        employerRate,
        grossPay,
        employeeContribution,
        employerContribution,
        netBeforeTax: round2(grossPay - employeeContribution),
        totalCost: round2(grossPay + employerContribution),
        hasSalaryProfile: Boolean(salary),
      }
    })
    return {
      monthKey,
      rows,
      totals: {
        workedHours: sum(rows.map((row) => row.workedHours)),
        grossPay: sum(rows.map((row) => row.grossPay)),
        employeeContribution: sum(rows.map((row) => row.employeeContribution)),
        employerContribution: sum(rows.map((row) => row.employerContribution)),
        netBeforeTax: sum(rows.map((row) => row.netBeforeTax)),
        totalCost: sum(rows.map((row) => row.totalCost)),
      },
    }
  }

  async getPayroll(
    ctx: RequestContext,
    monthKey: string
  ): Promise<PayrollData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)
    if (!isMonthKey(monthKey)) {
      throw new ValidationError("Invalid payroll month.")
    }
    const range = monthDateRange(monthKey)
    const [memberInfo, salaryRows, attendanceRows] = await Promise.all([
      this.loadMembers(ctx.organizationId),
      this.repo.listSalaryProfiles(ctx.organizationId),
      this.repo.listAttendance(
        ctx.organizationId,
        parseDateKey(range.start),
        parseDateKey(range.end)
      ),
    ])
    const entries = attendanceRows.map((row) =>
      this.mapAttendance(row, false, ctx.userId)
    )
    return this.computePayroll(
      memberInfo.members,
      salaryRows,
      memberInfo.settings,
      entries,
      monthKey
    )
  }
}
