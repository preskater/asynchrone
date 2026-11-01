import type { RequestContext } from "@workspace/core/context"
import { NotFoundError, ValidationError } from "@workspace/core/errors"
import type { EmployeeAccess } from "../access"
import { parseDateKey, toDateKey } from "../date-utils"
import type {
  ClearAttendanceInput,
  SetAttendanceInput,
  SetDayStatusInput,
} from "../schemas"
import {
  DAY_PERIODS,
  isAbsenceStatus,
  type AttendanceEntryData,
  type AttendanceStatus,
  type WorkLocationKind,
} from "../types"
import {
  EmployeesServiceCore,
  requireTrack,
  requireAdmin,
  type AttendanceRow,
} from "./core"

const QUICK_LOCATION: Partial<Record<AttendanceStatus, WorkLocationKind>> = {
  on_site: "on_site",
  remote: "remote",
  business_trip: "traveling",
}

export class EmployeeAttendanceService extends EmployeesServiceCore {
  private attendanceSnapshot(row: {
    userId: string
    date: Date
    period: string
    status: string
    location: string | null
    projectId: string | null
    internalActivityId: string | null
    isBillable: boolean
    comment: string | null
  }) {
    return {
      userId: row.userId,
      date: toDateKey(row.date),
      period: row.period,
      status: row.status,
      location: row.location,
      projectId: row.projectId,
      internalActivityId: row.internalActivityId,
      isBillable: row.isBillable,
      comment: row.comment,
    }
  }

  async setAttendance(
    ctx: RequestContext,
    input: SetAttendanceInput
  ): Promise<AttendanceEntryData> {
    const access = await this.accessFor(ctx)
    return this.writeAttendance(ctx, input, access)
  }

  /**
   * Write one half-day using an access decision the caller already resolved.
   * `setDayStatus` uses this to update both periods with a single profile query.
   */
  private async writeAttendance(
    ctx: RequestContext,
    input: SetAttendanceInput,
    access: EmployeeAccess
  ): Promise<AttendanceEntryData> {
    const targetUserId = input.userId ?? ctx.userId
    if (targetUserId === ctx.userId) {
      requireTrack(access)
    } else if (!access.isAdmin) {
      requireAdmin(access)
    }

    if (input.projectId != null && input.internalActivityId != null) {
      throw new ValidationError(
        "Choose either a project or an internal activity, not both."
      )
    }

    let projectId = input.projectId
    let activityId = input.internalActivityId
    let projectIsBillable: boolean | undefined
    if (projectId) {
      const project = await this.repo.findProject(ctx.organizationId, projectId)
      if (!project) throw new NotFoundError("Project")
      projectIsBillable = project.isBillable
    }
    if (activityId) {
      const activity = await this.repo.findActivity(
        ctx.organizationId,
        activityId
      )
      if (!activity) throw new NotFoundError("Internal activity")
    }

    const absence = isAbsenceStatus(input.status)
    if (absence) {
      projectId = null
      activityId = null
    }

    let isBillable: boolean | undefined
    if (absence || projectId === null) {
      isBillable = false
    } else if (projectId) {
      isBillable = projectIsBillable ?? false
    }

    const date = parseDateKey(input.date)
    const existing = await this.repo.findAttendance(
      ctx.organizationId,
      targetUserId,
      date,
      input.period
    )

    let row
    if (!existing) {
      row = await this.repo.createAttendance({
        organizationId: ctx.organizationId,
        userId: targetUserId,
        date,
        period: input.period,
        status: input.status,
        location: input.location ?? null,
        projectId: projectId ?? null,
        internalActivityId: activityId ?? null,
        leaveRequestId: null,
        isBillable: isBillable ?? false,
        comment: input.comment ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      })
    } else {
      row = await this.repo.updateAttendance(existing.id, {
        status: input.status,
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
        ...(activityId !== undefined ? { internalActivityId: activityId } : {}),
        ...(isBillable !== undefined ? { isBillable } : {}),
        ...(input.comment !== undefined ? { comment: input.comment } : {}),
        updatedBy: ctx.userId,
      })
    }

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: existing ? "attendance.update" : "attendance.create",
        entityType: "attendance",
        entityId: row.id,
        before: existing ? this.attendanceSnapshot(existing) : undefined,
        after: this.attendanceSnapshot(row),
      },
    ])

    return this.mapAttendance(row, false, ctx.userId)
  }

  async clearAttendance(
    ctx: RequestContext,
    input: ClearAttendanceInput
  ): Promise<{ cleared: number }> {
    const access = await this.accessFor(ctx)
    const targetUserId = input.userId ?? ctx.userId
    if (targetUserId === ctx.userId) {
      requireTrack(access)
    } else if (!access.isAdmin) {
      requireAdmin(access)
    }

    const date = parseDateKey(input.date)
    const existingRows = (
      await Promise.all(
        input.periods.map((period) =>
          this.repo.findAttendance(
            ctx.organizationId,
            targetUserId,
            date,
            period
          )
        )
      )
    ).filter((row): row is AttendanceRow => Boolean(row))

    await this.repo.deleteAttendance(
      ctx.organizationId,
      targetUserId,
      date,
      input.periods
    )

    if (existingRows.length > 0) {
      await this.repo.createAudit([
        {
          organizationId: ctx.organizationId,
          actorId: ctx.userId,
          action: "attendance.clear",
          entityType: "attendance",
          entityId: `${targetUserId}:${input.date}`,
          before: existingRows.map((row) => this.attendanceSnapshot(row)),
        },
      ])
    }
    return { cleared: existingRows.length }
  }

  /** Quick action: set the same status for one or both halves of a day. */
  async setDayStatus(
    ctx: RequestContext,
    input: SetDayStatusInput
  ): Promise<{ updated: number }> {
    const access = await this.accessFor(ctx)
    const periods = input.periods ?? [...DAY_PERIODS]
    const location = QUICK_LOCATION[input.status] ?? null
    // One access lookup for both half-days, then parallel writes.
    await Promise.all(
      periods.map((period) =>
        this.writeAttendance(
          ctx,
          {
            userId: input.userId,
            date: input.date,
            period,
            status: input.status,
            location,
          },
          access
        )
      )
    )
    return { updated: periods.length }
  }
}
