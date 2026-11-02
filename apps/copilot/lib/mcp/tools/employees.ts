import { z } from "zod"

import { callDomain, delegatedContext } from "@/lib/internal/domain"
import {
  attendanceStatusSchema,
  createLeaveBase,
  fetchRangeSchema,
} from "@workspace/employees/schemas"

import type { McpTool } from "./projects"

const result = z.unknown()

function call(
  ctx: Parameters<McpTool["run"]>[0],
  operation:
    | "get-employees-overview"
    | "fetch-attendance"
    | "set-attendance"
    | "set-day-status"
    | "create-leave"
    | "decide-leave"
    | "fetch-tracking",
  input: unknown
) {
  return callDomain(
    "employees",
    operation,
    delegatedContext(ctx),
    input,
    result
  )
}

export const employeeTools: McpTool[] = [
  {
    name: "get_employees_overview",
    title: "Get employees overview",
    description:
      "Get the time & attendance dashboard: today's presence, leave requests, balances, capacity, alerts, clients, activities and projects.",
    inputSchema: {},
    readOnly: true,
    run: (ctx) => call(ctx, "get-employees-overview", {}),
  },
  {
    name: "list_attendance",
    title: "List attendance",
    description:
      "List half-day attendance entries (status, allocation) for a date range (YYYY-MM-DD).",
    inputSchema: {
      from: z.string().describe("Start day, e.g. 2026-10-01"),
      to: z.string().describe("End day, inclusive"),
    },
    readOnly: true,
    run: (ctx, input) =>
      call(ctx, "fetch-attendance", fetchRangeSchema.parse(input)),
  },
  {
    name: "set_attendance",
    title: "Set attendance",
    description:
      "Declare the caller's attendance. Without `period`, sets both halves of the day (status only). With `period`, sets that half and can also attach a project or internal activity allocation.",
    inputSchema: {
      date: z.string().describe("Day key, e.g. 2026-10-13"),
      status: attendanceStatusSchema.describe(
        "on_site | remote | leave | rtt | sick_leave | training | business_trip | holiday | unavailable | other"
      ),
      period: z.enum(["morning", "afternoon"]).optional(),
      projectId: z.string().optional(),
      internalActivityId: z.string().optional(),
      comment: z.string().optional(),
    },
    readOnly: false,
    run: (ctx, input) => {
      const date = String(input.date)
      const period = input.period as "morning" | "afternoon" | undefined
      if (!period) {
        return call(ctx, "set-day-status", { date, status: input.status })
      }
      return call(ctx, "set-attendance", {
        date,
        period,
        status: input.status,
        projectId: (input.projectId as string | undefined) ?? undefined,
        internalActivityId:
          (input.internalActivityId as string | undefined) ?? undefined,
        comment: (input.comment as string | undefined) ?? undefined,
      })
    },
  },
  {
    name: "request_leave",
    title: "Request leave",
    description:
      "Create a leave request for the caller. Duration is counted in working half-days (Mon-Fri, excluding French public holidays).",
    inputSchema: {
      type: z
        .enum(["paid_leave", "rtt", "unpaid", "sick", "training", "other"])
        .default("paid_leave"),
      startDate: z.string().describe("Day key, e.g. 2026-10-26"),
      endDate: z.string().describe("Day key, inclusive"),
      startPeriod: z.enum(["morning", "afternoon"]).optional(),
      endPeriod: z.enum(["morning", "afternoon"]).optional(),
      comment: z.string().optional(),
    },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "create-leave", createLeaveBase.parse(input)),
  },
  {
    name: "decide_leave",
    title: "Approve or reject leave",
    description:
      "Approve or reject a pending leave request. Requires the validator role; you cannot decide your own request.",
    inputSchema: {
      requestId: z.string(),
      decision: z.enum(["approved", "rejected"]),
      comment: z.string().optional(),
    },
    readOnly: false,
    run: (ctx, input) =>
      call(ctx, "decide-leave", {
        requestId: String(input.requestId),
        decision: input.decision,
        comment: input.comment,
      }),
  },
  {
    name: "get_time_tracking",
    title: "Get time tracking",
    description:
      "Aggregate allocated time (billable, non-billable, internal) by user, project and client for a date range.",
    inputSchema: {
      from: z.string().describe("Start day, e.g. 2026-10-01"),
      to: z.string().describe("End day, inclusive"),
    },
    readOnly: true,
    run: (ctx, input) =>
      call(ctx, "fetch-tracking", fetchRangeSchema.parse(input)),
  },
]
