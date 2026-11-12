import { z } from "zod"

import type {
  DelegatedContext,
  DomainCall,
  DomainOperation,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import { rolesFrom } from "@workspace/core/roles"
import { NotFoundError } from "@workspace/core/errors"
import {
  createLeaveSchema,
  decideLeaveSchema,
  fetchRangeSchema,
  setAttendanceSchema,
  setDayStatusSchema,
} from "@workspace/employees/schemas"

import { employeesService } from "@/lib/employees"

function requestContext(context: DelegatedContext): RequestContext {
  return {
    userId: context.userId,
    userName: context.userName,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    roles: rolesFrom(context),
  }
}

const rangeInput = fetchRangeSchema

export async function dispatchDomain(
  operation: DomainOperation,
  call: DomainCall
): Promise<unknown> {
  const ctx = requestContext(call.context)

  switch (operation) {
    case "get-employees-overview":
      return employeesService.getOverview(ctx)
    case "fetch-attendance": {
      const range = rangeInput.parse(call.input)
      return employeesService.fetchAttendance(ctx, range.from, range.to)
    }
    case "set-attendance":
      return employeesService.setAttendance(
        ctx,
        setAttendanceSchema.parse(call.input)
      )
    case "set-day-status":
      return employeesService.setDayStatus(
        ctx,
        setDayStatusSchema.parse(call.input)
      )
    case "create-leave":
      return employeesService.createLeave(
        ctx,
        createLeaveSchema.parse(call.input)
      )
    case "decide-leave": {
      const input = z
        .object({ requestId: z.string().min(1) })
        .extend(decideLeaveSchema.shape)
        .parse(call.input)
      const { requestId, ...decision } = input
      return employeesService.decideLeave(ctx, requestId, decision)
    }
    case "fetch-tracking": {
      const range = rangeInput.parse(call.input)
      return employeesService.fetchTracking(ctx, range.from, range.to)
    }
    default:
      throw new NotFoundError("Domain operation")
  }
}
