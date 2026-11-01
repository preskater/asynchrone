export const DAY_PERIODS = ["morning", "afternoon"] as const
export type DayPeriod = (typeof DAY_PERIODS)[number]

export const ATTENDANCE_STATUSES = [
  "on_site",
  "remote",
  "leave",
  "rtt",
  "sick_leave",
  "training",
  "business_trip",
  "holiday",
  "unavailable",
  "other",
] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const WORK_LOCATION_KINDS = [
  "on_site",
  "remote",
  "client_site",
  "traveling",
  "other",
] as const
export type WorkLocationKind = (typeof WORK_LOCATION_KINDS)[number]

export const LEAVE_TYPES = [
  "paid_leave",
  "rtt",
  "unpaid",
  "sick",
  "training",
  "other",
] as const
export type LeaveType = (typeof LEAVE_TYPES)[number]

export const LEAVE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const
export type LeaveStatus = (typeof LEAVE_STATUSES)[number]

export const BALANCE_TYPES = [
  "paid_leave",
  "rtt",
  "recovery",
  "unpaid",
  "training",
  "other",
] as const
export type BalanceType = (typeof BALANCE_TYPES)[number]

export const EMPLOYMENT_TYPES = [
  "associate",
  "employee",
  "intern",
  "contractor",
] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const CONTRACT_TYPES = [
  "cdi",
  "cdd",
  "internship",
  "freelance",
  "other",
] as const
export type ContractType = (typeof CONTRACT_TYPES)[number]

export const SALARY_TYPES = [
  "full_time",
  "part_time",
  "intern",
  "apprentice",
  "contractor",
  "other",
] as const
export type SalaryType = (typeof SALARY_TYPES)[number]

export const ACTIVITY_KINDS = ["internal", "non_billable"] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number]

export type AlertKind =
  | "no_allocation"
  | "overallocated"
  | "low_balance"
  | "pending_validation"
  | "project_overrun"
  | "missing_attendance"

/** Half-day statuses that reduce working capacity. */
export const ABSENCE_STATUSES: AttendanceStatus[] = [
  "leave",
  "rtt",
  "sick_leave",
  "training",
  "holiday",
  "unavailable",
]

/** Half-day statuses that count as actual work (can carry an allocation). */
export const WORKING_STATUSES: AttendanceStatus[] = [
  "on_site",
  "remote",
  "business_trip",
]

export function isAbsenceStatus(status: AttendanceStatus): boolean {
  return ABSENCE_STATUSES.includes(status)
}

export function isWorkingStatus(status: AttendanceStatus): boolean {
  return WORKING_STATUSES.includes(status)
}

/** Attendance status materialized on the calendar for an approved leave type. */
export const LEAVE_STATUS_TO_ATTENDANCE: Record<LeaveType, AttendanceStatus> = {
  paid_leave: "leave",
  rtt: "rtt",
  unpaid: "leave",
  sick: "sick_leave",
  training: "training",
  other: "other",
}

/** Leave types that consume a balance tracked in `LeaveBalance`. */
export const TRACKED_LEAVE_TYPES: BalanceType[] = [
  "paid_leave",
  "rtt",
  "recovery",
  "unpaid",
  "training",
  "other",
]

export interface EmployeeProfileData {
  employmentType: EmploymentType
  contractType: ContractType
  weeklyHours: number
  managerId?: string
  isValidator: boolean
  isActive: boolean
}

export interface EmployeeMemberData {
  id: string
  name: string
  email: string
  avatarUrl?: string
  /** Raw organization role (owner | admin | member | viewer). */
  orgRole: string
  profile: EmployeeProfileData
}

export interface AttendanceEntryData {
  id: string
  userId: string
  date: string
  period: DayPeriod
  status: AttendanceStatus
  location?: WorkLocationKind
  projectId?: string
  internalActivityId?: string
  leaveRequestId?: string
  isBillable: boolean
  comment?: string
}

export interface LeaveRequestData {
  id: string
  userId: string
  userName: string
  type: LeaveType
  status: LeaveStatus
  startDate: string
  endDate: string
  startPeriod: DayPeriod
  endPeriod: DayPeriod
  halfDays: number
  comment?: string
  validatorId?: string
  validatorName?: string
  decisionDate?: string
  decisionComment?: string
  createdAt: string
}

export interface LeaveBalanceData {
  userId: string
  userName: string
  leaveType: BalanceType
  year: number
  allowanceDays: number
  adjustmentDays: number
  acquiredDays: number
  usedDays: number
  pendingDays: number
  remainingDays: number
  expiresAt?: string
}

export interface LeaveAdjustmentData {
  id: string
  userId: string
  userName: string
  leaveType: BalanceType
  year: number
  days: number
  note?: string
  createdBy: string
  createdAt: string
}

export interface ClientData {
  id: string
  name: string
  contactEmail?: string
  isActive: boolean
}

export interface InternalActivityData {
  id: string
  name: string
  description?: string
  kind: ActivityKind
  isActive: boolean
}

export interface ProjectOptionData {
  id: string
  name: string
  status: string
  clientId?: string
  clientName?: string
  isBillable: boolean
  plannedHours?: number
  startDate?: string
  endDate?: string
}

export interface EmployeeSettingsData {
  defaultWeeklyHours: number
  defaultAllowanceDays: number
  lowBalanceThreshold: number
  pendingValidationDays: number
  /** Defaults for payroll when a member has no salary profile yet. */
  defaultEmployeeRate: number
  defaultEmployerRate: number
}

export interface AlertData {
  id: string
  kind: AlertKind
  severity: AlertSeverity
  userId?: string
  userName?: string
  projectId?: string
  projectName?: string
  count?: number
  hours?: number
  plannedHours?: number
  days?: number
  tab: "calendar" | "leave" | "capacity" | "tracking" | "admin"
}

export interface AuditLogData {
  id: string
  actorId: string
  actorName: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
}

export interface CapacityUserRow {
  userId: string
  userName: string
  weeklyHours: number
  availableHours: number
  allocatedHours: number
  remainingHours: number
}

export interface TrackingRow {
  id: string
  label: string
  sublabel?: string
  billableHours: number
  nonBillableHours: number
  internalHours: number
  totalHours: number
}

export interface TrackingResult {
  rowsByUser: TrackingRow[]
  rowsByProject: TrackingRow[]
  rowsByClient: TrackingRow[]
  totals: {
    billableHours: number
    nonBillableHours: number
    internalHours: number
    totalHours: number
  }
}

export interface SalaryProfileData {
  userId: string
  salaryType: SalaryType
  hourlyRate: number
  /** Employee contribution rate (cotisations salariales), % of gross. */
  employeeRate: number
  /** Employer contribution rate (cotisations patronales), % of gross. */
  employerRate: number
}

/**
 * One payroll line for a member and month. Hours are the worked half-days
 * recorded in attendance (on-site, remote, business trip) converted with the
 * member's weekly hours; money columns derive from the hourly wage and the
 * contribution rates.
 */
export interface PayrollRow {
  userId: string
  userName: string
  salaryType: SalaryType
  workedHours: number
  hourlyRate: number
  employeeRate: number
  employerRate: number
  /** Gross pay = worked hours × hourly wage. */
  grossPay: number
  employeeContribution: number
  employerContribution: number
  /** Gross minus employee contributions. */
  netBeforeTax: number
  /** Gross plus employer contributions (total employer cost). */
  totalCost: number
  /** True when the member has an explicit salary profile. */
  hasSalaryProfile: boolean
}

export interface PayrollTotals {
  workedHours: number
  grossPay: number
  employeeContribution: number
  employerContribution: number
  netBeforeTax: number
  totalCost: number
}

export interface PayrollData {
  monthKey: string
  rows: PayrollRow[]
  totals: PayrollTotals
}

export interface CapacityWeek {
  weekStart: string
  rows: CapacityUserRow[]
  totals: {
    availableHours: number
    allocatedHours: number
    remainingHours: number
  }
}

export interface EmployeeOverviewData {
  todayKey: string
  year: number
  currentUserId: string
  access: {
    isAdmin: boolean
    isValidator: boolean
    canViewAll: boolean
    canTrack: boolean
  }
  settings: EmployeeSettingsData
  members: EmployeeMemberData[]
  myProfile: EmployeeProfileData
  attendance: AttendanceEntryData[]
  attendanceRange: { start: string; end: string }
  /** Own requests, or every request when `canViewAll`. */
  leaveRequests: LeaveRequestData[]
  /** Pending requests the current user may act on (or follow). */
  pendingApprovals: LeaveRequestData[]
  /** Own balances, or every member's when `canViewAll`. */
  balances: LeaveBalanceData[]
  adjustments: LeaveAdjustmentData[]
  capacityWeeks: CapacityWeek[]
  capacityMonth: { rows: CapacityUserRow[]; totals: CapacityWeek["totals"] }
  alerts: AlertData[]
  /** Salary overview for the current month; admins only. */
  payroll: PayrollData | null
  clients: ClientData[]
  activities: InternalActivityData[]
  projects: ProjectOptionData[]
  audit: AuditLogData[]
}
