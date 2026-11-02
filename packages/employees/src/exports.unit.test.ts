import { describe, expect, it } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type { EmployeesRepository } from "./repository"
import { EmployeeExportsService } from "./services/exports"

const ctx: RequestContext = {
  userId: "user_owner",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  role: "owner",
}

function member(id: string, name: string) {
  return {
    userId: id,
    name,
    email: `${id}@example.com`,
    avatarUrl: undefined,
    role: "member",
    clientId: null,
  }
}

function leave(overrides: Record<string, unknown> = {}) {
  return {
    id: "leave_1",
    userId: "user_employee",
    type: "annual",
    status: "approved",
    startDate: new Date("2026-03-02T00:00:00.000Z"),
    endDate: new Date("2026-03-04T00:00:00.000Z"),
    startPeriod: "morning",
    endPeriod: "afternoon",
    halfDays: 5,
    comment: null,
    validatorId: "user_owner",
    decisionDate: new Date("2026-02-20T00:00:00.000Z"),
    decisionComment: "Approved",
    ...overrides,
  }
}

function service(rows = [leave()]) {
  const repo = {
    findProfile: async () => null,
    listMembers: async () => [
      member("user_owner", "Ada"),
      member("user_employee", "Grace"),
    ],
    listLeaveRequests: async () => rows,
    listAudit: async () => [],
  } as unknown as EmployeesRepository
  return new EmployeeExportsService(repo)
}

describe("employee CSV export", () => {
  it("exports the leave report with a BOM, semicolon separators and names", async () => {
    const result = await service().exportCsv(ctx, { report: "leave" })

    expect(result.filename).toMatch(
      /^asynchrone-space-leave-\d{4}-\d{2}-\d{2}\.csv$/
    )
    expect(result.content.startsWith("\uFEFF")).toBe(true)
    expect(result.content).toContain(
      "User;Type;Status;Start;Start half;End;End half;Half-days;Comment;Validator;Decision date;Decision comment"
    )
    expect(result.content).toContain(
      "Grace;annual;approved;2026-03-02;morning;2026-03-04;afternoon;5;;Ada;2026-02-20;Approved"
    )
  })

  it("only includes other members' rows when the caller can view the team", async () => {
    const memberCtx = {
      ...ctx,
      userId: "user_employee",
      role: "member" as const,
    }
    const result = await service([
      leave(),
      leave({ id: "leave_2", userId: "user_owner" }),
    ]).exportCsv(memberCtx, { report: "leave" })

    expect(result.content).toContain("Grace;annual;approved")
    expect(result.content).not.toContain("Ada;annual;approved")
  })

  it("keeps the audit export to admins", async () => {
    const memberCtx = { ...ctx, role: "member" as const }
    await expect(
      service().exportCsv(memberCtx, { report: "audit" })
    ).rejects.toMatchObject({ code: "role_cannot_manage_employees" })

    const adminCtx = { ...ctx, role: "admin" as const }
    await expect(
      service().exportCsv(adminCtx, { report: "audit" })
    ).resolves.toMatchObject({ filename: expect.stringContaining("audit") })
  })
})
