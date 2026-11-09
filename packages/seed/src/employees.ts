import { prisma } from "@workspace/db-employees"

import {
  ORG_ID,
  PROJECT_WEBSITE,
  TEAM,
  admin,
  day,
  designer,
  member,
  owner,
} from "./demo"

function isWeekend(date: Date): boolean {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6
}

export async function seedEmployees(): Promise<void> {
  await prisma.employeeSettings.createMany({
    data: [{ id: "demo_employee_settings", organizationId: ORG_ID }],
    skipDuplicates: true,
  })
  await prisma.employeeProfile.createMany({
    data: TEAM.map(({ id: userId }) => ({
      id: `${userId}_profile`,
      organizationId: ORG_ID,
      userId,
      managerId: userId === owner.id ? null : owner.id,
      isValidator: userId === owner.id || userId === admin.id,
    })),
    skipDuplicates: true,
  })

  const year = new Date().getUTCFullYear()
  await prisma.leaveBalance.createMany({
    data: TEAM.map(({ id: userId }) => ({
      id: `${userId}_paid_leave_${year}`,
      organizationId: ORG_ID,
      userId,
      leaveType: "paid_leave",
      year,
      allowanceDays: 25,
    })),
    skipDuplicates: true,
  })

  const leaves = [
    {
      id: "demo_leave_pending",
      userId: member.id,
      type: "paid_leave",
      startDate: day(14),
      endDate: day(18),
      halfDays: 10,
      comment: "Family trip",
    },
    {
      id: "demo_leave_approved",
      userId: designer.id,
      type: "rtt",
      status: "approved",
      startDate: day(6),
      endDate: day(6),
      halfDays: 2,
      validatorId: owner.id,
      decisionDate: day(-1),
    },
  ]
  for (const leave of leaves) {
    const data = { ...leave, organizationId: ORG_ID }
    await prisma.leaveRequest.upsert({
      where: { id: leave.id },
      create: data,
      update: data,
    })
  }

  // Keyed by date, so a later run adds the new days instead of rewriting old ones.
  const days = [0, -1, -2, -3, -4, -5, -6, -7]
    .map((offset) => day(offset))
    .filter((date) => !isWeekend(date))
  await prisma.attendanceEntry.createMany({
    data: TEAM.flatMap(({ id: userId }, index) =>
      days.flatMap((date) =>
        ["morning", "afternoon"].map((period) => ({
          id: `${userId}_${date.toISOString().slice(0, 10)}_${period}`,
          organizationId: ORG_ID,
          userId,
          date,
          period,
          status: index % 2 ? "remote" : "on_site",
          location: index % 2 ? "remote" : "on_site",
          projectId: PROJECT_WEBSITE,
          isBillable: true,
          createdBy: userId,
          updatedBy: userId,
        }))
      )
    ),
    skipDuplicates: true,
  })
}
