import type { DeletionResult } from "@workspace/contracts"

import { prisma } from "@/lib/prisma"

const APP = "employees"

export async function deleteOrganization(
  organizationId: string
): Promise<DeletionResult> {
  const where = { organizationId }
  const deleted = await prisma.$transaction(async (tx) => {
    const attendance = await tx.attendanceEntry.deleteMany({ where })
    const leave = await tx.leaveRequest.deleteMany({ where })
    const balances = await tx.leaveBalance.deleteMany({ where })
    const adjustments = await tx.leaveAdjustment.deleteMany({ where })
    const profiles = await tx.employeeProfile.deleteMany({ where })
    const settings = await tx.employeeSettings.deleteMany({ where })
    const salaries = await tx.salaryProfile.deleteMany({ where })
    const activities = await tx.internalActivity.deleteMany({ where })
    const auditLog = await tx.auditLog.deleteMany({ where })
    return {
      attendanceEntry: attendance.count,
      leaveRequest: leave.count,
      leaveBalance: balances.count,
      leaveAdjustment: adjustments.count,
      employeeProfile: profiles.count,
      employeeSettings: settings.count,
      salaryProfile: salaries.count,
      internalActivity: activities.count,
      auditLog: auditLog.count,
    }
  })
  return { app: APP, organizationId, deleted, completedAt: new Date() }
}

export async function deleteUser(
  userId: string,
  organizationId = ""
): Promise<DeletionResult> {
  const deleted = await prisma.$transaction(async (tx) => {
    const attendance = await tx.attendanceEntry.deleteMany({
      where: { userId },
    })
    const leave = await tx.leaveRequest.deleteMany({ where: { userId } })
    const balances = await tx.leaveBalance.deleteMany({ where: { userId } })
    const adjustments = await tx.leaveAdjustment.deleteMany({
      where: { userId },
    })
    const profiles = await tx.employeeProfile.deleteMany({ where: { userId } })
    const salaries = await tx.salaryProfile.deleteMany({ where: { userId } })
    return {
      attendanceEntry: attendance.count,
      leaveRequest: leave.count,
      leaveBalance: balances.count,
      leaveAdjustment: adjustments.count,
      employeeProfile: profiles.count,
      salaryProfile: salaries.count,
    }
  })
  return {
    app: APP,
    organizationId,
    userId,
    deleted,
    completedAt: new Date(),
  }
}
