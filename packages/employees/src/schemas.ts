import { z } from "zod"

import {
  ACTIVITY_KINDS,
  ATTENDANCE_STATUSES,
  BALANCE_TYPES,
  CONTRACT_TYPES,
  EMPLOYMENT_TYPES,
  LEAVE_TYPES,
  SALARY_TYPES,
  WORK_LOCATION_KINDS,
} from "./types"

// Rejects impossible days (2026-02-30) a bare pattern lets through.
export const dateKeySchema = z.iso.date("Expected a YYYY-MM-DD date.")

export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Expected a YYYY-MM month.")

export const periodSchema = z.enum(["morning", "afternoon"])

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES)
export const workLocationSchema = z.enum(WORK_LOCATION_KINDS)
export const leaveTypeSchema = z.enum(LEAVE_TYPES)
export const balanceTypeSchema = z.enum(BALANCE_TYPES)

export const setAttendanceSchema = z.object({
  /** Admins may edit another member's half-day. */
  userId: z.string().min(1).optional(),
  date: dateKeySchema,
  period: periodSchema,
  status: attendanceStatusSchema,
  /** `null` clears, `undefined` leaves untouched. */
  location: workLocationSchema.nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  internalActivityId: z.string().min(1).nullable().optional(),
  comment: z.string().max(500).nullable().optional(),
})

export const clearAttendanceSchema = z.object({
  userId: z.string().min(1).optional(),
  date: dateKeySchema,
  periods: z.array(periodSchema).min(1).default(["morning", "afternoon"]),
})

export const setDayStatusSchema = z.object({
  userId: z.string().min(1).optional(),
  date: dateKeySchema,
  status: attendanceStatusSchema,
  periods: z.array(periodSchema).min(1).optional(),
})

export const createLeaveBase = z.object({
  /** Admins may create a request on behalf of another member. */
  userId: z.string().min(1).optional(),
  type: leaveTypeSchema.default("paid_leave"),
  startDate: dateKeySchema,
  endDate: dateKeySchema,
  startPeriod: periodSchema.default("morning"),
  endPeriod: periodSchema.default("afternoon"),
  comment: z.string().max(500).optional(),
})

export const createLeaveSchema = createLeaveBase.refine(
  (value) => value.endDate >= value.startDate,
  {
    message: "The end date must be on or after the start date.",
    path: ["endDate"],
  }
)

export const decideLeaveSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().max(500).optional(),
})

export const adjustBalanceSchema = z
  .object({
    userId: z.string().min(1),
    leaveType: balanceTypeSchema,
    year: z.number().int().min(2000).max(2100),
    /** Positive or negative; zero is rejected. */
    days: z.number().min(-365).max(365),
    note: z.string().max(300).optional(),
  })
  .refine((value) => value.days !== 0, {
    message: "Enter a non-zero adjustment.",
    path: ["days"],
  })

export const setAllowanceSchema = z.object({
  userId: z.string().min(1),
  leaveType: balanceTypeSchema,
  year: z.number().int().min(2000).max(2100),
  allowanceDays: z.number().min(0).max(365),
  expiresAt: dateKeySchema.nullable().optional(),
})

export const updateSettingsSchema = z.object({
  defaultWeeklyHours: z.number().min(1).max(80),
  defaultAllowanceDays: z.number().min(0).max(365),
  lowBalanceThreshold: z.number().min(0).max(100),
  pendingValidationDays: z.number().int().min(0).max(30),
  defaultEmployeeRate: z.number().min(0).max(100),
  defaultEmployerRate: z.number().min(0).max(100),
})

export const updateSalarySchema = z.object({
  userId: z.string().min(1),
  salaryType: z.enum(SALARY_TYPES),
  hourlyRate: z.number().min(0).max(10_000),
  employeeRate: z.number().min(0).max(100),
  employerRate: z.number().min(0).max(100),
})

export const updateProfileSchema = z.object({
  userId: z.string().min(1),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  contractType: z.enum(CONTRACT_TYPES),
  weeklyHours: z.number().min(1).max(80),
  managerId: z.string().min(1).nullable().optional(),
  isValidator: z.boolean(),
  isActive: z.boolean(),
})

export const clientSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  contactEmail: z.string().max(200).nullable().optional(),
  isActive: z.boolean().default(true),
})

export const activitySchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  kind: z.enum(ACTIVITY_KINDS).default("internal"),
  isActive: z.boolean().default(true),
})

export const projectEmployeeSchema = z.object({
  projectId: z.string().min(1),
  clientId: z.string().min(1).nullable().optional(),
  plannedHours: z.number().min(0).max(1_000_000).nullable().optional(),
  isBillable: z.boolean(),
  startDate: dateKeySchema.nullable().optional(),
  endDate: dateKeySchema.nullable().optional(),
})

export const fetchRangeSchema = z.object({
  from: dateKeySchema,
  to: dateKeySchema,
})

export const exportSchema = z.object({
  report: z.enum([
    "attendance",
    "leave",
    "project-time",
    "client-time",
    "capacity",
    "payroll",
    "audit",
  ]),
  from: dateKeySchema.optional(),
  to: dateKeySchema.optional(),
  /** Payroll exports only: the month to report on (defaults to the current one). */
  month: monthKeySchema.optional(),
})

export type SetAttendanceInput = z.infer<typeof setAttendanceSchema>
export type ClearAttendanceInput = z.infer<typeof clearAttendanceSchema>
export type SetDayStatusInput = z.infer<typeof setDayStatusSchema>
export type CreateLeaveInput = z.infer<typeof createLeaveSchema>
export type DecideLeaveInput = z.infer<typeof decideLeaveSchema>
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>
export type SetAllowanceInput = z.infer<typeof setAllowanceSchema>
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
export type UpdateSalaryInput = z.infer<typeof updateSalarySchema>
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type ClientInput = z.infer<typeof clientSchema>
export type ActivityInput = z.infer<typeof activitySchema>
export type ProjectEmployeeInput = z.infer<typeof projectEmployeeSchema>
export type ExportInput = z.infer<typeof exportSchema>
