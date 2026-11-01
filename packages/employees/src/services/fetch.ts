import type { RequestContext } from "@workspace/core/context"
import { parseDateKey, round2 } from "../date-utils"
import type { AttendanceEntryData, TrackingResult, TrackingRow } from "../types"
import { halfDayHours, sum } from "../utils"
import { EmployeesServiceCore } from "./core"

export class EmployeeFetchService extends EmployeesServiceCore {
  async fetchAttendance(
    ctx: RequestContext,
    fromKey: string,
    toKey: string
  ): Promise<{ start: string; end: string; entries: AttendanceEntryData[] }> {
    const access = await this.accessFor(ctx)
    const rows = await this.repo.listAttendance(
      ctx.organizationId,
      parseDateKey(fromKey),
      parseDateKey(toKey)
    )
    return {
      start: fromKey,
      end: toKey,
      entries: rows.map((row) =>
        this.mapAttendance(row, !access.canViewAll, ctx.userId)
      ),
    }
  }

  async fetchTracking(
    ctx: RequestContext,
    fromKey: string,
    toKey: string
  ): Promise<TrackingResult> {
    const access = await this.accessFor(ctx)
    const [rows, memberInfo, clientRows, projectRows, activityRows] =
      await Promise.all([
        this.repo.listAllocationEntries(ctx.organizationId, {
          from: parseDateKey(fromKey),
          to: parseDateKey(toKey),
        }),
        this.loadMembers(ctx.organizationId),
        this.repo.listClients(ctx.organizationId),
        this.repo.listProjects(ctx.organizationId),
        this.repo.listActivities(ctx.organizationId),
      ])

    const { members, nameById } = memberInfo
    const memberById = new Map(members.map((member) => [member.id, member]))
    const clientById = new Map(
      clientRows.map((client) => [client.id, client.name])
    )
    const projectById = new Map(
      projectRows.map((project) => [project.id, project])
    )
    const activityById = new Map(
      activityRows.map((activity) => [activity.id, activity])
    )

    const scoped = access.canViewAll
      ? rows
      : rows.filter((row) => row.userId === ctx.userId)

    type Bucket = {
      id: string
      label: string
      sublabel?: string
      billable: number
      nonBillable: number
      internal: number
    }
    const byUser = new Map<string, Bucket>()
    const byProject = new Map<string, Bucket>()
    const byClient = new Map<string, Bucket>()

    const add = (
      map: Map<string, Bucket>,
      bucket: Bucket,
      hours: number,
      kind: "billable" | "nonBillable" | "internal"
    ) => {
      bucket[kind] = round2(bucket[kind] + hours)
      map.set(bucket.id, bucket)
    }

    for (const row of scoped) {
      const member = memberById.get(row.userId)
      const hours = halfDayHours(member?.profile.weeklyHours ?? 35)
      const project = row.projectId ? projectById.get(row.projectId) : undefined
      const activity = row.internalActivityId
        ? activityById.get(row.internalActivityId)
        : undefined

      let kind: "billable" | "nonBillable" | "internal"
      if (project) {
        kind = project.isBillable ? "billable" : "nonBillable"
      } else if (activity) {
        kind = activity.kind === "internal" ? "internal" : "nonBillable"
      } else {
        continue
      }

      const userBucket =
        byUser.get(row.userId) ??
        ({
          id: row.userId,
          label: member?.name ?? nameById.get(row.userId) ?? "—",
          billable: 0,
          nonBillable: 0,
          internal: 0,
        } satisfies Bucket)
      add(byUser, userBucket, hours, kind)

      if (project) {
        const key = `${row.userId}|${project.id}`
        const bucket =
          byProject.get(key) ??
          ({
            id: key,
            label: project.name,
            sublabel: member?.name,
            billable: 0,
            nonBillable: 0,
            internal: 0,
          } satisfies Bucket)
        add(byProject, bucket, hours, kind)

        const clientName = project.clientId
          ? clientById.get(project.clientId)
          : undefined
        if (clientName) {
          const clientKey = `${row.userId}|${project.clientId}`
          const clientBucket =
            byClient.get(clientKey) ??
            ({
              id: clientKey,
              label: clientName,
              sublabel: member?.name,
              billable: 0,
              nonBillable: 0,
              internal: 0,
            } satisfies Bucket)
          add(byClient, clientBucket, hours, kind)
        }
      }
    }

    const toRows = (map: Map<string, Bucket>): TrackingRow[] =>
      [...map.values()]
        .map((bucket) => ({
          id: bucket.id,
          label: bucket.label,
          sublabel: bucket.sublabel,
          billableHours: bucket.billable,
          nonBillableHours: bucket.nonBillable,
          internalHours: bucket.internal,
          totalHours: round2(
            bucket.billable + bucket.nonBillable + bucket.internal
          ),
        }))
        .sort((a, b) => b.totalHours - a.totalHours)

    const rowsByUser = toRows(byUser)
    return {
      rowsByUser,
      rowsByProject: toRows(byProject),
      rowsByClient: toRows(byClient),
      totals: {
        billableHours: sum(rowsByUser.map((row) => row.billableHours)),
        nonBillableHours: sum(rowsByUser.map((row) => row.nonBillableHours)),
        internalHours: sum(rowsByUser.map((row) => row.internalHours)),
        totalHours: sum(rowsByUser.map((row) => row.totalHours)),
      },
    }
  }
}
