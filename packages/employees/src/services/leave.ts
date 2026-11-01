import type { RequestContext } from "@workspace/core/context"
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@workspace/core/errors"
import { parseDateKey, toDateKey } from "../date-utils"
import type { CreateLeaveInput, DecideLeaveInput } from "../schemas"
import {
  LEAVE_STATUS_TO_ATTENDANCE,
  type DayPeriod,
  type LeaveRequestData,
  type LeaveType,
} from "../types"
import { halfKeysBetween } from "../utils"
import {
  EmployeesServiceCore,
  requireTrack,
  requireValidator,
  requireAdmin,
  type LeaveRow,
} from "./core"

const PERIOD_INDEX: Record<DayPeriod, number> = { morning: 0, afternoon: 1 }

export class EmployeeLeaveService extends EmployeesServiceCore {
  private validateLeaveRange(
    startDate: string,
    endDate: string,
    startPeriod: DayPeriod,
    endPeriod: DayPeriod
  ) {
    if (endDate < startDate) {
      throw new ValidationError(
        "The end date must be on or after the start date."
      )
    }
    if (
      startDate === endDate &&
      PERIOD_INDEX[startPeriod] > PERIOD_INDEX[endPeriod]
    ) {
      throw new ValidationError(
        "On a single day, the end half must not be before the start half."
      )
    }
  }

  async createLeave(
    ctx: RequestContext,
    input: CreateLeaveInput
  ): Promise<LeaveRequestData> {
    const access = await this.accessFor(ctx)
    const targetUserId = input.userId ?? ctx.userId
    if (targetUserId === ctx.userId) {
      requireTrack(access)
    } else if (!access.isAdmin) {
      requireAdmin(access)
    }

    this.validateLeaveRange(
      input.startDate,
      input.endDate,
      input.startPeriod,
      input.endPeriod
    )

    const keys = halfKeysBetween(
      input.startDate,
      input.startPeriod,
      input.endDate,
      input.endPeriod
    )
    if (keys.length === 0) {
      throw new ValidationError(
        "Pick a range that includes at least one working half-day."
      )
    }

    // Overlap detection: other pending/approved requests of the same user.
    const existing = await this.repo.listLeaveRequests(ctx.organizationId)
    const requested = new Set(keys)
    for (const row of existing) {
      if (row.userId !== targetUserId) continue
      if (row.status !== "pending" && row.status !== "approved") continue
      const rowKeys = halfKeysBetween(
        toDateKey(row.startDate),
        row.startPeriod as DayPeriod,
        toDateKey(row.endDate),
        row.endPeriod as DayPeriod
      )
      if (rowKeys.some((key) => requested.has(key))) {
        throw new ConflictError(
          "This request overlaps an existing leave request.",
          { code: "leave_overlapping" }
        )
      }
    }

    const row = await this.repo.createLeaveRequest({
      organizationId: ctx.organizationId,
      userId: targetUserId,
      type: input.type,
      startDate: parseDateKey(input.startDate),
      endDate: parseDateKey(input.endDate),
      startPeriod: input.startPeriod,
      endPeriod: input.endPeriod,
      // Half-day units throughout: balances divide by 2 for days.
      halfDays: keys.length,
      comment: input.comment,
    })

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "leave.create",
        entityType: "leaveRequest",
        entityId: row.id,
        after: this.leaveSnapshot(row),
      },
    ])

    const nameById = await this.namesById(ctx.organizationId)
    return this.mapLeave(row, nameById)
  }

  private leaveSnapshot(row: LeaveRow) {
    return {
      userId: row.userId,
      type: row.type,
      status: row.status,
      startDate: toDateKey(row.startDate),
      endDate: toDateKey(row.endDate),
      startPeriod: row.startPeriod,
      endPeriod: row.endPeriod,
      halfDays: row.halfDays,
    }
  }

  async decideLeave(
    ctx: RequestContext,
    requestId: string,
    input: DecideLeaveInput
  ): Promise<LeaveRequestData> {
    const access = await this.accessFor(ctx)
    requireValidator(access)

    const row = await this.repo.findLeaveRequest(ctx.organizationId, requestId)
    if (!row) throw new NotFoundError("Leave request")

    if (row.userId === ctx.userId) {
      throw new ConflictError("You cannot decide on your own leave request.", {
        code: "leave_self_approval",
      })
    }
    if (row.status !== "pending") {
      throw new ConflictError("This request has already been decided.", {
        code: "leave_not_pending",
      })
    }

    if (input.decision === "approved") {
      const status = LEAVE_STATUS_TO_ATTENDANCE[row.type as LeaveType]
      const keys = halfKeysBetween(
        toDateKey(row.startDate),
        row.startPeriod as DayPeriod,
        toDateKey(row.endDate),
        row.endPeriod as DayPeriod
      )
      for (const key of keys) {
        const [dateKey, period] = key.split(":") as [string, DayPeriod]
        const date = parseDateKey(dateKey)
        const existing = await this.repo.findAttendance(
          ctx.organizationId,
          row.userId,
          date,
          period
        )
        if (existing) {
          await this.repo.updateAttendance(existing.id, {
            status,
            location: null,
            projectId: null,
            internalActivityId: null,
            leaveRequestId: row.id,
            isBillable: false,
            updatedBy: ctx.userId,
          })
        } else {
          await this.repo.createAttendance({
            organizationId: ctx.organizationId,
            userId: row.userId,
            date,
            period,
            status,
            leaveRequestId: row.id,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })
        }
      }
    }

    const updated = await this.repo.updateLeaveRequest(requestId, {
      status: input.decision,
      validatorId: ctx.userId,
      decisionDate: new Date(),
      decisionComment: input.comment,
    })

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: `leave.${input.decision}`,
        entityType: "leaveRequest",
        entityId: requestId,
        before: this.leaveSnapshot(row),
        after: this.leaveSnapshot(updated),
      },
    ])

    return this.mapLeave(updated, await this.namesById(ctx.organizationId))
  }

  async cancelLeave(
    ctx: RequestContext,
    requestId: string
  ): Promise<LeaveRequestData> {
    const access = await this.accessFor(ctx)

    const row = await this.repo.findLeaveRequest(ctx.organizationId, requestId)
    if (!row) throw new NotFoundError("Leave request")

    if (row.userId !== ctx.userId) {
      requireAdmin(access)
    } else {
      requireTrack(access)
    }

    if (row.status !== "pending" && row.status !== "approved") {
      throw new ConflictError("This request can no longer be cancelled.", {
        code: "leave_not_pending",
      })
    }

    if (row.status === "approved") {
      await this.repo.deleteAttendanceByLeaveRequest(requestId)
    }

    const updated = await this.repo.updateLeaveRequest(requestId, {
      status: "cancelled",
    })

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "leave.cancel",
        entityType: "leaveRequest",
        entityId: requestId,
        before: this.leaveSnapshot(row),
        after: this.leaveSnapshot(updated),
      },
    ])

    return this.mapLeave(updated, await this.namesById(ctx.organizationId))
  }
}
