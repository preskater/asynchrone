import { buildExportPart } from "@workspace/sagas"

import { prisma } from "@/lib/prisma"

export function exportOrganization(organizationId: string) {
  const where = { organizationId }
  return buildExportPart("employees", {
    employeeProfile: () => prisma.employeeProfile.findMany({ where }),
    attendanceEntry: () => prisma.attendanceEntry.findMany({ where }),
    leaveRequest: () => prisma.leaveRequest.findMany({ where }),
    leaveBalance: () => prisma.leaveBalance.findMany({ where }),
    leaveAdjustment: () => prisma.leaveAdjustment.findMany({ where }),
    employeeSettings: () => prisma.employeeSettings.findMany({ where }),
    salaryProfile: () => prisma.salaryProfile.findMany({ where }),
    internalActivity: () => prisma.internalActivity.findMany({ where }),
    auditLog: () => prisma.auditLog.findMany({ where }),
  })
}
