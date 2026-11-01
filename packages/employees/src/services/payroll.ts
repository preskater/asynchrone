import type { RequestContext } from "@workspace/core/context"
import { NotFoundError } from "@workspace/core/errors"
import type { UpdateSalaryInput } from "../schemas"
import type { SalaryProfileData, SalaryType } from "../types"
import { EmployeesServiceCore, requireAdmin } from "./core"

export class EmployeePayrollService extends EmployeesServiceCore {
  async updateSalary(
    ctx: RequestContext,
    input: UpdateSalaryInput
  ): Promise<SalaryProfileData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    const members = await this.repo.listMembers(ctx.organizationId)
    if (!members.some((member) => member.userId === input.userId)) {
      throw new NotFoundError("Member")
    }

    const before = await this.repo.findSalaryProfile(
      ctx.organizationId,
      input.userId
    )
    const row = await this.repo.upsertSalaryProfile(
      ctx.organizationId,
      input.userId,
      {
        salaryType: input.salaryType,
        hourlyRate: input.hourlyRate,
        employeeRate: input.employeeRate,
        employerRate: input.employerRate,
      }
    )

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "salary.update",
        entityType: "salaryProfile",
        entityId: row.id,
        before: before
          ? {
              salaryType: before.salaryType,
              hourlyRate: before.hourlyRate,
              employeeRate: before.employeeRate,
              employerRate: before.employerRate,
            }
          : undefined,
        after: {
          salaryType: row.salaryType,
          hourlyRate: row.hourlyRate,
          employeeRate: row.employeeRate,
          employerRate: row.employerRate,
        },
      },
    ])

    return {
      userId: row.userId,
      salaryType: row.salaryType as SalaryType,
      hourlyRate: row.hourlyRate,
      employeeRate: row.employeeRate,
      employerRate: row.employerRate,
    }
  }
}
