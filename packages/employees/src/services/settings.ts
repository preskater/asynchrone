import type { RequestContext } from "@workspace/core/context"
import { parseDateKey } from "../date-utils"
import type {
  AdjustBalanceInput,
  SetAllowanceInput,
  UpdateProfileInput,
  UpdateSettingsInput,
} from "../schemas"
import type {
  BalanceType,
  EmployeeProfileData,
  EmployeeSettingsData,
  LeaveAdjustmentData,
} from "../types"
import { EmployeesServiceCore, requireAdmin, DEFAULT_SETTINGS } from "./core"

export class EmployeeSettingsService extends EmployeesServiceCore {
  async setAllowance(
    ctx: RequestContext,
    input: SetAllowanceInput
  ): Promise<{ userId: string; leaveType: BalanceType; year: number }> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    const row = await this.repo.upsertBalance(
      ctx.organizationId,
      input.userId,
      input.leaveType,
      input.year,
      {
        allowanceDays: input.allowanceDays,
        expiresAt: input.expiresAt ? parseDateKey(input.expiresAt) : null,
      }
    )

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "balance.set",
        entityType: "leaveBalance",
        entityId: row.id,
        after: { allowanceDays: row.allowanceDays, leaveType: row.leaveType },
      },
    ])

    return {
      userId: row.userId,
      leaveType: row.leaveType as BalanceType,
      year: row.year,
    }
  }

  async adjustBalance(
    ctx: RequestContext,
    input: AdjustBalanceInput
  ): Promise<LeaveAdjustmentData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    const row = await this.repo.createAdjustment({
      organizationId: ctx.organizationId,
      userId: input.userId,
      leaveType: input.leaveType,
      year: input.year,
      days: input.days,
      note: input.note,
      createdBy: ctx.userId,
    })

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "balance.adjust",
        entityType: "leaveAdjustment",
        entityId: row.id,
        after: {
          userId: row.userId,
          leaveType: row.leaveType,
          days: row.days,
        },
      },
    ])

    return this.mapAdjustment(row, await this.namesById(ctx.organizationId))
  }

  async updateSettings(
    ctx: RequestContext,
    input: UpdateSettingsInput
  ): Promise<EmployeeSettingsData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    const row = await this.repo.upsertSettings(ctx.organizationId, input)

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "settings.update",
        entityType: "employeeSettings",
        entityId: row.id,
        after: input,
      },
    ])

    return {
      defaultWeeklyHours: row.defaultWeeklyHours,
      defaultAllowanceDays: row.defaultAllowanceDays,
      lowBalanceThreshold: row.lowBalanceThreshold,
      pendingValidationDays: row.pendingValidationDays,
      defaultEmployeeRate: row.defaultEmployeeRate,
      defaultEmployerRate: row.defaultEmployerRate,
    }
  }

  async updateProfile(
    ctx: RequestContext,
    input: UpdateProfileInput
  ): Promise<EmployeeProfileData> {
    const access = await this.accessFor(ctx)
    requireAdmin(access)

    const before = await this.repo.findProfile(ctx.organizationId, input.userId)
    const row = await this.repo.upsertProfile(
      ctx.organizationId,
      input.userId,
      {
        employmentType: input.employmentType,
        contractType: input.contractType,
        weeklyHours: input.weeklyHours,
        managerId: input.managerId ?? null,
        isValidator: input.isValidator,
        isActive: input.isActive,
      }
    )

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "profile.update",
        entityType: "employeeProfile",
        entityId: row.id,
        before: before
          ? {
              weeklyHours: before.weeklyHours,
              isValidator: before.isValidator,
              isActive: before.isActive,
            }
          : undefined,
        after: {
          weeklyHours: row.weeklyHours,
          isValidator: row.isValidator,
          isActive: row.isActive,
        },
      },
    ])

    return this.mapProfile(row, DEFAULT_SETTINGS)
  }
}
