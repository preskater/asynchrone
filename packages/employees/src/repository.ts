import type { PrismaClient } from "@workspace/db"

import type { EmployeeAudit, EmployeeAuditEntry } from "./ports"

export class EmployeesRepository {
  constructor(
    private readonly db: PrismaClient,
    private readonly audit: EmployeeAudit
  ) {}

  // --- Members & profiles ---------------------------------------------------

  listMembers(organizationId: string) {
    return this.db.member.findMany({
      where: { organizationId, clientId: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "asc" },
    })
  }

  listProfiles(organizationId: string) {
    return this.db.employeeProfile.findMany({ where: { organizationId } })
  }

  findProfile(organizationId: string, userId: string) {
    return this.db.employeeProfile.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    })
  }

  upsertProfile(
    organizationId: string,
    userId: string,
    data: {
      employmentType: string
      contractType: string
      weeklyHours: number
      managerId: string | null
      isValidator: boolean
      isActive: boolean
    }
  ) {
    return this.db.employeeProfile.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, ...data },
      update: data,
    })
  }

  // --- Attendance -----------------------------------------------------------

  listAttendance(organizationId: string, from: Date, to: Date) {
    return this.db.attendanceEntry.findMany({
      where: { organizationId, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { period: "asc" }],
    })
  }

  findAttendance(
    organizationId: string,
    userId: string,
    date: Date,
    period: string
  ) {
    return this.db.attendanceEntry.findUnique({
      where: {
        organizationId_userId_date_period: {
          organizationId,
          userId,
          date,
          period,
        },
      },
    })
  }

  createAttendance(data: {
    organizationId: string
    userId: string
    date: Date
    period: string
    status: string
    location?: string | null
    projectId?: string | null
    internalActivityId?: string | null
    leaveRequestId?: string | null
    isBillable?: boolean
    comment?: string | null
    createdBy: string
    updatedBy: string
  }) {
    return this.db.attendanceEntry.create({ data })
  }

  updateAttendance(
    id: string,
    data: {
      status?: string
      location?: string | null
      projectId?: string | null
      internalActivityId?: string | null
      leaveRequestId?: string | null
      isBillable?: boolean
      comment?: string | null
      updatedBy: string
    }
  ) {
    return this.db.attendanceEntry.update({ where: { id }, data })
  }

  deleteAttendance(
    organizationId: string,
    userId: string,
    date: Date,
    periods: string[]
  ) {
    return this.db.attendanceEntry.deleteMany({
      where: { organizationId, userId, date, period: { in: periods } },
    })
  }

  deleteAttendanceByLeaveRequest(leaveRequestId: string) {
    return this.db.attendanceEntry.deleteMany({ where: { leaveRequestId } })
  }

  /** Allocation-bearing entries (any period), optionally limited to a range. */
  listAllocationEntries(
    organizationId: string,
    options: { from?: Date; to?: Date } = {}
  ) {
    return this.db.attendanceEntry.findMany({
      where: {
        organizationId,
        OR: [
          { projectId: { not: null } },
          { internalActivityId: { not: null } },
        ],
        ...(options.from || options.to
          ? {
              date: {
                ...(options.from ? { gte: options.from } : {}),
                ...(options.to ? { lte: options.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: "asc" },
    })
  }

  // --- Leave ----------------------------------------------------------------

  /** Requests that still matter: ending on/after `from`, plus pending ones. */
  listLeaveRequests(organizationId: string, options: { from?: Date } = {}) {
    return this.db.leaveRequest.findMany({
      where: {
        organizationId,
        ...(options.from
          ? {
              OR: [{ endDate: { gte: options.from } }, { status: "pending" }],
            }
          : {}),
      },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    })
  }

  findLeaveRequest(organizationId: string, id: string) {
    return this.db.leaveRequest.findFirst({ where: { id, organizationId } })
  }

  createLeaveRequest(data: {
    organizationId: string
    userId: string
    type: string
    startDate: Date
    endDate: Date
    startPeriod: string
    endPeriod: string
    halfDays: number
    comment?: string
  }) {
    return this.db.leaveRequest.create({ data })
  }

  updateLeaveRequest(
    id: string,
    data: {
      status?: string
      validatorId?: string
      decisionDate?: Date
      decisionComment?: string
      comment?: string
    }
  ) {
    return this.db.leaveRequest.update({ where: { id }, data })
  }

  // --- Balances ---------------------------------------------------------------

  listBalances(organizationId: string, year: number) {
    return this.db.leaveBalance.findMany({
      where: { organizationId, year },
    })
  }

  upsertBalance(
    organizationId: string,
    userId: string,
    leaveType: string,
    year: number,
    data: { allowanceDays: number; expiresAt: Date | null }
  ) {
    return this.db.leaveBalance.upsert({
      where: {
        organizationId_userId_leaveType_year: {
          organizationId,
          userId,
          leaveType,
          year,
        },
      },
      create: { organizationId, userId, leaveType, year, ...data },
      update: data,
    })
  }

  listAdjustments(organizationId: string, year: number) {
    return this.db.leaveAdjustment.findMany({
      where: { organizationId, year },
      orderBy: { createdAt: "desc" },
    })
  }

  createAdjustment(data: {
    organizationId: string
    userId: string
    leaveType: string
    year: number
    days: number
    note?: string
    createdBy: string
  }) {
    return this.db.leaveAdjustment.create({ data })
  }

  // --- Clients, activities, projects -----------------------------------------

  listClients(organizationId: string) {
    return this.db.client.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    })
  }

  findClient(organizationId: string, id: string) {
    return this.db.client.findFirst({ where: { id, organizationId } })
  }

  createClient(data: {
    organizationId: string
    name: string
    contactEmail?: string | null
    isActive: boolean
  }) {
    return this.db.client.create({ data })
  }

  updateClient(
    id: string,
    data: { name: string; contactEmail?: string | null; isActive: boolean }
  ) {
    return this.db.client.update({ where: { id }, data })
  }

  listActivities(organizationId: string) {
    return this.db.internalActivity.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    })
  }

  findActivity(organizationId: string, id: string) {
    return this.db.internalActivity.findFirst({
      where: { id, organizationId },
    })
  }

  createActivity(data: {
    organizationId: string
    name: string
    description?: string | null
    kind: string
    isActive: boolean
  }) {
    return this.db.internalActivity.create({ data })
  }

  updateActivity(
    id: string,
    data: {
      name: string
      description?: string | null
      kind: string
      isActive: boolean
    }
  ) {
    return this.db.internalActivity.update({ where: { id }, data })
  }

  listProjects(organizationId: string) {
    return this.db.project.findMany({
      where: { organizationId },
      include: { client: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    })
  }

  findProject(organizationId: string, id: string) {
    return this.db.project.findFirst({ where: { id, organizationId } })
  }

  updateProject(
    id: string,
    data: {
      clientId?: string | null
      plannedHours?: number | null
      isBillable?: boolean
      startDate?: Date | null
      endDate?: Date | null
    }
  ) {
    return this.db.project.update({ where: { id }, data })
  }

  // --- Payroll ---------------------------------------------------------------

  listSalaryProfiles(organizationId: string) {
    return this.db.salaryProfile.findMany({ where: { organizationId } })
  }

  findSalaryProfile(organizationId: string, userId: string) {
    return this.db.salaryProfile.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    })
  }

  upsertSalaryProfile(
    organizationId: string,
    userId: string,
    data: {
      salaryType: string
      hourlyRate: number
      employeeRate: number
      employerRate: number
    }
  ) {
    return this.db.salaryProfile.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, ...data },
      update: data,
    })
  }

  // --- Audit -------------------------------------------------------------------

  /**
   * Audit rows for this module. Goes through the shared audit helper so every
   * write lands in one table with the same actor snapshot.
   */
  async createAudit(entries: EmployeeAuditEntry[]): Promise<{ count: number }> {
    if (entries.length === 0) return { count: 0 }
    return this.audit(entries)
  }

  listAudit(organizationId: string, limit = 100) {
    return this.db.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  }

  // --- Settings ------------------------------------------------------------------

  findSettings(organizationId: string) {
    return this.db.employeeSettings.findUnique({ where: { organizationId } })
  }

  upsertSettings(
    organizationId: string,
    data: {
      defaultWeeklyHours: number
      defaultAllowanceDays: number
      lowBalanceThreshold: number
      pendingValidationDays: number
      defaultEmployeeRate: number
      defaultEmployerRate: number
    }
  ) {
    return this.db.employeeSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    })
  }
}
