import "dotenv/config"

import { randomUUID } from "node:crypto"

import { AUDIT_ACTIONS } from "../lib/audit/actions"
import { auditService } from "../lib/audit/service"
import { pruneAuditLogs } from "../lib/audit/prune"
import type { RequestContext } from "@workspace/core/context"
import { projectService } from "../lib/projects"
import { prisma } from "../lib/prisma"

/**
 * Manual check for the customer-facing audit log (issue #92), against throwaway
 * organizations in the configured database: coverage of the mutation paths,
 * role and entitlement gating, filters, export, the Enterprise retention
 * override and the cleanup job.
 *
 * The retention job walks every organization, exactly like the daily CronJob;
 * run this against a development database. Run with:
 *
 *   npm run verify:audit-log
 */

const DAY = 24 * 60 * 60 * 1000

let failures = 0

function check(ok: boolean, message: string) {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗ FAILED"} ${message}`)
}

/** The error code of a rejected call, or "ok". */
async function errorCode(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
    return "ok"
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const users = {
    owner: `user_audit_owner_${suffix}`,
    admin: `user_audit_admin_${suffix}`,
    member: `user_audit_member_${suffix}`,
  }
  const orgs = {
    main: `org_audit_main_${suffix}`,
    free: `org_audit_free_${suffix}`,
    large: `org_audit_large_${suffix}`,
  }
  const now = new Date()

  const ctx = (
    userId: string,
    organizationId: string,
    role: RequestContext["role"] = "owner"
  ): RequestContext => ({
    userId,
    userName: userId,
    userEmail: `${userId}@audit.verify`,
    organizationId,
    role,
  })

  try {
    for (const id of Object.values(users)) {
      await prisma.user.create({
        data: {
          id,
          name: id,
          email: `${id}@audit.verify`,
          emailVerified: true,
        },
      })
    }
    await prisma.organization.createMany({
      data: [
        {
          id: orgs.main,
          name: "Audit verify",
          slug: orgs.main.replaceAll("_", "-"),
          metadata: JSON.stringify({ plan: "enterprise" }),
          createdAt: now,
        },
        {
          id: orgs.free,
          name: "Audit verify free",
          slug: orgs.free.replaceAll("_", "-"),
          createdAt: now,
        },
        {
          id: orgs.large,
          name: "Audit verify large",
          slug: orgs.large.replaceAll("_", "-"),
          metadata: JSON.stringify({ plan: "enterprise" }),
          createdAt: now,
        },
      ],
    })
    await prisma.member.createMany({
      data: [
        {
          id: `member_${suffix}_1`,
          organizationId: orgs.main,
          userId: users.owner,
          role: "owner",
          createdAt: now,
        },
        {
          id: `member_${suffix}_2`,
          organizationId: orgs.main,
          userId: users.admin,
          role: "admin",
          createdAt: now,
        },
        {
          id: `member_${suffix}_3`,
          organizationId: orgs.main,
          userId: users.member,
          role: "member",
          createdAt: now,
        },
        {
          id: `member_${suffix}_4`,
          organizationId: orgs.free,
          userId: users.owner,
          role: "owner",
          createdAt: now,
        },
      ],
    })

    const owner = ctx(users.owner, orgs.main)
    const admin = ctx(users.admin, orgs.main, "admin")
    const member = ctx(users.member, orgs.main, "member")

    // --- Coverage: task deletion, role change, member removal --------------
    const project = await projectService.create(owner, {
      name: "Audit verify project",
    })
    const task = await projectService.createTask(owner, {
      projectId: project.id,
      title: "Task to delete",
    })
    await projectService.removeTask(owner, task.id)
    const taskRows = await prisma.auditLog.findMany({
      where: {
        organizationId: orgs.main,
        action: AUDIT_ACTIONS.taskDeleted,
      },
    })
    check(
      taskRows.length === 1 &&
        taskRows[0]?.actorId === users.owner &&
        taskRows[0]?.actorName === users.owner &&
        taskRows[0]?.entityId === task.id &&
        taskRows[0]?.entityLabel === task.identifier,
      "deleting a task writes exactly one row with the actor and the target"
    )

    await projectService.updateMemberRole(owner, users.member, {
      role: "admin",
    })
    const roleRows = await prisma.auditLog.findMany({
      where: {
        organizationId: orgs.main,
        action: AUDIT_ACTIONS.organizationMemberRoleChanged,
      },
    })
    check(
      roleRows.length === 1 &&
        roleRows[0]?.entityId === users.member &&
        roleRows[0]?.before != null &&
        roleRows[0]?.after != null,
      "changing a role writes exactly one row with before/after"
    )

    await projectService.removeMember(owner, users.admin)
    const removalRows = await prisma.auditLog.findMany({
      where: {
        organizationId: orgs.main,
        action: AUDIT_ACTIONS.organizationMemberRemoved,
      },
    })
    check(
      removalRows.length === 1 &&
        removalRows[0]?.entityId === users.admin &&
        removalRows[0]?.entityLabel === `${users.admin}@audit.verify`,
      "removing a member writes exactly one row targeting that member"
    )

    // --- Gating -------------------------------------------------------------
    check(
      (await errorCode(() => auditService.list(member, {}))) === "forbidden",
      "a member gets forbidden from the audit log"
    )
    check(
      (await errorCode(() =>
        auditService.list(ctx(users.admin, orgs.main, "admin"), {})
      )) === "ok",
      "an admin can read the audit log"
    )
    check(
      (await errorCode(() =>
        auditService.list(ctx(users.owner, orgs.free), {})
      )) === "upgrade_required",
      "a workspace without the entitlement is asked to upgrade"
    )
    const page = await auditService.list(owner, {})
    check(
      page.total >= 3 && page.items.length === page.total,
      "the list returns every row"
    )

    // --- Filters ------------------------------------------------------------
    const filtered = await auditService.list(owner, {
      action: AUDIT_ACTIONS.taskDeleted,
    })
    check(
      filtered.items.length === 1 && filtered.total === 1,
      "the action filter narrows the page"
    )
    const byActor = await auditService.list(owner, { actorId: users.owner })
    check(byActor.total === 5, "the actor filter narrows the page")
    const today = now.toISOString().slice(0, 10)
    check(
      (await auditService.list(owner, { from: today, to: today })).total === 5,
      "a single-day range includes the events of that day"
    )
    check(
      (await auditService.list(owner, { from: "2000-01-01", to: "2000-01-02" }))
        .total === 0,
      "a past range excludes today's events"
    )
    const facets = await auditService.facets(owner)
    check(
      facets.actions.some((item) => item.value === AUDIT_ACTIONS.taskDeleted) &&
        facets.actors.some((actor) => actor.id === users.owner),
      "facets expose the actions and actors of the window"
    )

    // --- Export -------------------------------------------------------------
    const csv = await auditService.export(
      owner,
      { action: AUDIT_ACTIONS.taskDeleted },
      "csv"
    )
    check(
      csv.count === 1 &&
        !csv.truncated &&
        csv.content.includes("Timestamp;Actor;") &&
        csv.content.includes(task.identifier),
      "the CSV export follows the active filter"
    )
    const json = await auditService.export(owner, {}, "json")
    const parsedJson = JSON.parse(json.content) as {
      entries: { action: string }[]
    }
    check(
      parsedJson.entries.length === 5 && json.filename.endsWith(".json"),
      "the JSON export returns the filter as structured data"
    )

    // An export larger than the cap is truncated rather than streamed forever.
    await prisma.auditLog.createMany({
      data: Array.from({ length: 5_010 }, (_, index) => ({
        organizationId: orgs.large,
        actorId: users.owner,
        action: AUDIT_ACTIONS.projectUpdated,
        entityType: "project",
        entityId: `bulk_${index}`,
      })),
    })
    const capped = await auditService.export(
      ctx(users.owner, orgs.large),
      {},
      "csv"
    )
    check(
      capped.truncated && capped.count === 5_000,
      "an export over the cap is truncated to 5000 rows"
    )
    check(
      (await auditService.list(ctx(users.owner, orgs.large), { limit: 10 }))
        .total === 5_010,
      "the page stays small while the total counts every row"
    )

    // --- Retention ----------------------------------------------------------
    const retention = await auditService.retention(owner)
    check(
      retention.plan === "enterprise" &&
        retention.days === 730 &&
        retention.canConfigure,
      "Enterprise defaults to 730 days and may configure its window"
    )
    const updated = await auditService.setRetention(owner, 90)
    check(
      updated.days === 90 && updated.overrideDays === 90,
      "the owner sets a 90-day window"
    )
    check(
      (await prisma.auditLog.count({
        where: {
          organizationId: orgs.main,
          action: AUDIT_ACTIONS.organizationAuditRetentionUpdated,
        },
      })) === 1,
      "changing retention is itself audited"
    )
    check(
      (await errorCode(() => auditService.setRetention(admin, 120))) ===
        "forbidden",
      "an admin cannot change the retention window"
    )
    check(
      (await errorCode(() =>
        auditService.setRetention(ctx(users.owner, orgs.free), 60)
      )) === "upgrade_required",
      "a non-Enterprise workspace cannot configure retention"
    )
    const reset = await auditService.setRetention(owner, null)
    check(
      reset.days === 730 && reset.overrideDays === null,
      "clearing the override falls back to the plan"
    )

    // --- Cleanup job --------------------------------------------------------
    await prisma.auditLog.create({
      data: {
        organizationId: orgs.free,
        actorId: users.owner,
        action: AUDIT_ACTIONS.projectCreated,
        entityType: "project",
        entityId: "stale",
        createdAt: new Date(now.getTime() - 40 * DAY),
      },
    })
    await prisma.auditLog.create({
      data: {
        organizationId: orgs.free,
        actorId: users.owner,
        action: AUDIT_ACTIONS.projectCreated,
        entityType: "project",
        entityId: "fresh",
      },
    })
    const platformEvent = await prisma.platformAuditEvent.create({
      data: {
        actorId: "operator_verify",
        actorEmail: "operator@verify",
        actorRole: "platform_admin",
        action: "organization.plan.update",
        targetType: "organization",
        targetId: orgs.free,
        organizationId: orgs.free,
        createdAt: new Date(now.getTime() - 400 * DAY),
      },
    })
    await pruneAuditLogs({ now })
    check(
      (await prisma.auditLog.count({
        where: { organizationId: orgs.free, entityId: "stale" },
      })) === 0,
      "the cleanup job prunes rows past the plan window (30 days on Starter)"
    )
    check(
      (await prisma.auditLog.count({
        where: { organizationId: orgs.free, entityId: "fresh" },
      })) === 1,
      "the cleanup job keeps rows inside the window"
    )
    check(
      (await prisma.platformAuditEvent.count({
        where: { id: platformEvent.id },
      })) === 1,
      "the cleanup job never touches PlatformAuditEvent"
    )
    check(
      (await prisma.auditLog.count({ where: { organizationId: orgs.main } })) >=
        3,
      "the Enterprise window (730 days) keeps everything"
    )
  } finally {
    await prisma.platformAuditEvent
      .deleteMany({ where: { organizationId: { in: Object.values(orgs) } } })
      .catch(() => {})
    await prisma.organization
      .deleteMany({ where: { id: { in: Object.values(orgs) } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { id: { in: Object.values(users) } } })
      .catch(() => {})
    await prisma.$disconnect()
  }

  if (failures > 0) {
    console.error(`\n${failures} audit-log check(s) failed`)
    process.exitCode = 1
  } else {
    console.log("\nAll audit-log checks passed")
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
