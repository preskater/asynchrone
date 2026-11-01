import type { RequestContext } from "@workspace/core/context"
import type { CsvFile } from "./csv"
import type {
  ActivityInput,
  AdjustBalanceInput,
  ClientInput,
  ClearAttendanceInput,
  CreateLeaveInput,
  DecideLeaveInput,
  ExportInput,
  ProjectEmployeeInput,
  SetAllowanceInput,
  SetAttendanceInput,
  SetDayStatusInput,
  UpdateProfileInput,
  UpdateSalaryInput,
  UpdateSettingsInput,
} from "./schemas"
import type {
  AttendanceEntryData,
  BalanceType,
  ClientData,
  EmployeeOverviewData,
  EmployeeProfileData,
  EmployeeSettingsData,
  InternalActivityData,
  LeaveAdjustmentData,
  LeaveRequestData,
  ProjectOptionData,
  SalaryProfileData,
  TrackingResult,
} from "./types"

import type { EmployeesRepository } from "./repository"
import { EmployeesServiceCore } from "./services/core"
import { EmployeeOverviewService } from "./services/overview"
import { EmployeeAttendanceService } from "./services/attendance"
import { EmployeeLeaveService } from "./services/leave"
import { EmployeeSettingsService } from "./services/settings"
import { EmployeePayrollService } from "./services/payroll"
import { EmployeeRecordsService } from "./services/records"
import { EmployeeFetchService } from "./services/fetch"
import { EmployeeExportsService } from "./services/exports"

/**
 * Employees facade. Each method delegates to the sub-domain service in
 * `./services`; shared helpers (and `getPayroll`) live on
 * `EmployeesServiceCore`, which this class extends.
 */
export class EmployeesService extends EmployeesServiceCore {
  private readonly overview: EmployeeOverviewService
  private readonly attendance: EmployeeAttendanceService
  private readonly leave: EmployeeLeaveService
  private readonly settings: EmployeeSettingsService
  private readonly payroll: EmployeePayrollService
  private readonly records: EmployeeRecordsService
  private readonly fetch: EmployeeFetchService
  private readonly exports: EmployeeExportsService

  constructor(repo: EmployeesRepository) {
    super(repo)
    this.overview = new EmployeeOverviewService(repo)
    this.attendance = new EmployeeAttendanceService(repo)
    this.leave = new EmployeeLeaveService(repo)
    this.settings = new EmployeeSettingsService(repo)
    this.payroll = new EmployeePayrollService(repo)
    this.records = new EmployeeRecordsService(repo)
    this.fetch = new EmployeeFetchService(repo)
    this.exports = new EmployeeExportsService(repo)
  }

  async getOverview(ctx: RequestContext): Promise<EmployeeOverviewData> {
    return this.overview.getOverview(ctx)
  }

  async setAttendance(
    ctx: RequestContext,
    input: SetAttendanceInput
  ): Promise<AttendanceEntryData> {
    return this.attendance.setAttendance(ctx, input)
  }

  async clearAttendance(
    ctx: RequestContext,
    input: ClearAttendanceInput
  ): Promise<{ cleared: number }> {
    return this.attendance.clearAttendance(ctx, input)
  }

  async setDayStatus(
    ctx: RequestContext,
    input: SetDayStatusInput
  ): Promise<{ updated: number }> {
    return this.attendance.setDayStatus(ctx, input)
  }

  async createLeave(
    ctx: RequestContext,
    input: CreateLeaveInput
  ): Promise<LeaveRequestData> {
    return this.leave.createLeave(ctx, input)
  }

  async decideLeave(
    ctx: RequestContext,
    requestId: string,
    input: DecideLeaveInput
  ): Promise<LeaveRequestData> {
    return this.leave.decideLeave(ctx, requestId, input)
  }

  async cancelLeave(
    ctx: RequestContext,
    requestId: string
  ): Promise<LeaveRequestData> {
    return this.leave.cancelLeave(ctx, requestId)
  }

  async setAllowance(
    ctx: RequestContext,
    input: SetAllowanceInput
  ): Promise<{ userId: string; leaveType: BalanceType; year: number }> {
    return this.settings.setAllowance(ctx, input)
  }

  async adjustBalance(
    ctx: RequestContext,
    input: AdjustBalanceInput
  ): Promise<LeaveAdjustmentData> {
    return this.settings.adjustBalance(ctx, input)
  }

  async updateSettings(
    ctx: RequestContext,
    input: UpdateSettingsInput
  ): Promise<EmployeeSettingsData> {
    return this.settings.updateSettings(ctx, input)
  }

  async updateProfile(
    ctx: RequestContext,
    input: UpdateProfileInput
  ): Promise<EmployeeProfileData> {
    return this.settings.updateProfile(ctx, input)
  }

  async updateSalary(
    ctx: RequestContext,
    input: UpdateSalaryInput
  ): Promise<SalaryProfileData> {
    return this.payroll.updateSalary(ctx, input)
  }

  async saveClient(
    ctx: RequestContext,
    input: ClientInput
  ): Promise<ClientData> {
    return this.records.saveClient(ctx, input)
  }

  async saveActivity(
    ctx: RequestContext,
    input: ActivityInput
  ): Promise<InternalActivityData> {
    return this.records.saveActivity(ctx, input)
  }

  async updateProjectEmployee(
    ctx: RequestContext,
    input: ProjectEmployeeInput
  ): Promise<ProjectOptionData> {
    return this.records.updateProjectEmployee(ctx, input)
  }

  async fetchAttendance(
    ctx: RequestContext,
    fromKey: string,
    toKey: string
  ): Promise<{ start: string; end: string; entries: AttendanceEntryData[] }> {
    return this.fetch.fetchAttendance(ctx, fromKey, toKey)
  }

  async fetchTracking(
    ctx: RequestContext,
    fromKey: string,
    toKey: string
  ): Promise<TrackingResult> {
    return this.fetch.fetchTracking(ctx, fromKey, toKey)
  }

  async exportCsv(ctx: RequestContext, input: ExportInput): Promise<CsvFile> {
    return this.exports.exportCsv(ctx, input)
  }
}
