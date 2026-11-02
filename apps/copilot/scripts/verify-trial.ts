import "dotenv/config"

import { randomUUID } from "node:crypto"

import { getAiQuota } from "../lib/assistant/usage"
import type { RequestContext } from "@workspace/core/context"
import { getOrganizationEntitlements } from "../lib/organization/entitlements"
import {
  getTrialStatus,
  processTrials,
  startTeamTrial,
} from "../lib/organization/trial-service"
import { prisma } from "../lib/prisma"

/**
 * Manual check for the Team trial of issue #84, against throwaway
 * organizations in the configured database: start, abuse checks, D-3
 * reminder, expiry, idempotence and the paid-during-trial case. The clock is
 * simulated by passing `now` to the services. Run with:
 *
 *   npm run verify:trial
 */

const DAY = 24 * 60 * 60 * 1000
const GB = 1024 * 1024 * 1024

let failures = 0

function check(ok: boolean, message: string) {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗ FAILED"} ${message}`)
}

/** The refusal code, or "started" when the trial was granted. */
async function tryStart(ctx: RequestContext, now: Date): Promise<string> {
  try {
    await startTeamTrial(ctx, now)
    return "started"
  } catch (error) {
    return (error as { code?: string }).code ?? String(error)
  }
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const domain = `acme-${suffix}.verify`
  const users = {
    owner: { id: `user_trial_owner_${suffix}`, email: `owner@${domain}` },
    colleague: {
      id: `user_trial_colleague_${suffix}`,
      email: `colleague@${domain}`,
    },
    member: {
      id: `user_trial_member_${suffix}`,
      email: `member-${suffix}@gmail.com`,
    },
    gmail: {
      id: `user_trial_gmail_${suffix}`,
      email: `trial-${suffix}@gmail.com`,
    },
    unverified: {
      id: `user_trial_unverified_${suffix}`,
      email: `unverified-${suffix}@gmail.com`,
    },
  }
  const orgs = {
    main: `org_trial_main_${suffix}`, // owner + member
    second: `org_trial_second_${suffix}`, // owner again
    colleague: `org_trial_colleague_${suffix}`, // same company domain
    gmail: `org_trial_gmail_${suffix}`, // public domain, later paid
    unverified: `org_trial_unverified_${suffix}`,
  }
  const emails = Object.values(users).map((user) => user.email)

  try {
    const start = new Date()
    for (const user of Object.values(users)) {
      await prisma.user.create({
        data: {
          id: user.id,
          name: user.id,
          email: user.email,
          emailVerified: user !== users.unverified,
        },
      })
    }
    for (const [key, id] of Object.entries(orgs)) {
      await prisma.organization.create({
        data: {
          id,
          name: `Trial ${key}`,
          slug: id.replaceAll("_", "-"),
          createdAt: start,
        },
      })
    }
    const memberships = [
      [orgs.main, users.owner, "owner"],
      [orgs.main, users.member, "member"],
      [orgs.second, users.owner, "owner"],
      [orgs.colleague, users.colleague, "owner"],
      [orgs.gmail, users.gmail, "owner"],
      [orgs.unverified, users.unverified, "owner"],
    ] as const
    for (const [organizationId, user, role] of memberships) {
      await prisma.member.create({
        data: {
          id: `member_${user.id}_${organizationId}`,
          organizationId,
          userId: user.id,
          role,
          createdAt: start,
        },
      })
    }

    const ctx = (
      user: { id: string; email: string },
      organizationId: string,
      role: RequestContext["role"] = "owner"
    ): RequestContext => ({
      userId: user.id,
      userName: user.id,
      userEmail: user.email,
      organizationId,
      role,
    })
    const notifications = (organizationId: string, type: string) =>
      prisma.notification.count({ where: { organizationId, type } })

    // Start
    check(
      (await getOrganizationEntitlements(orgs.main)).storageBytes === 1 * GB,
      "free workspace starts with 1 GB"
    )
    check(
      (await tryStart(ctx(users.member, orgs.main, "member"), start)) ===
        "forbidden",
      "a member cannot start the trial"
    )
    check(
      (await tryStart(ctx(users.owner, orgs.main), start)) === "started",
      "an owner with a verified email starts the trial"
    )
    const main = await prisma.organization.findUniqueOrThrow({
      where: { id: orgs.main },
    })
    check(
      main.trialEndsAt?.getTime() === start.getTime() + 14 * DAY,
      "trialEndsAt is now + 14 days"
    )
    check(
      (await getOrganizationEntitlements(orgs.main)).storageBytes === 100 * GB,
      "Team quota (100 GB) applies immediately"
    )
    check(
      (await getTrialStatus(orgs.main, start))?.daysLeft === 14,
      "banner status reports 14 days left"
    )
    const trialEntitlements = await getOrganizationEntitlements(orgs.main)
    check(
      trialEntitlements.seats === 100 &&
        trialEntitlements.granularPermissions &&
        trialEntitlements.aiBudgetMicrosPerSeat > 0,
      "the whole Team plan applies during the trial, not just storage"
    )
    check(
      (await getAiQuota(orgs.main, start)).budgetMicros > 0,
      "the AI allowance is unlocked during the trial"
    )

    // Abuse checks
    check(
      (await tryStart(ctx(users.owner, orgs.main), start)) ===
        "trial_already_used",
      "the same organization cannot start a second trial"
    )
    check(
      (await tryStart(ctx(users.owner, orgs.second), start)) ===
        "trial_already_claimed",
      "the same email cannot start a trial in another organization"
    )
    check(
      (await tryStart(ctx(users.colleague, orgs.colleague), start)) ===
        "trial_already_claimed",
      "the same company domain cannot start another trial"
    )
    check(
      (await tryStart(ctx(users.unverified, orgs.unverified), start)) ===
        "trial_email_unverified",
      "an unverified email cannot start a trial"
    )
    check(
      (await tryStart(ctx(users.gmail, orgs.gmail), start)) === "started",
      "a public mailbox domain (gmail.com) is not blocked by domain"
    )

    // Data created during the trial must survive the downgrade.
    const trialRow = await prisma.notification.create({
      data: {
        organizationId: orgs.main,
        userId: users.owner.id,
        type: "task.assigned",
        data: { title: "Created during the trial" },
      },
      select: { id: true },
    })

    // D-3 reminder
    const d3 = new Date(start.getTime() + 11 * DAY + 60_000)
    await processTrials(d3)
    await processTrials(d3)
    check(
      (await notifications(orgs.main, "trial.reminder")) === 1,
      "D-3 reminder is sent once to the owner, not to members, over two runs"
    )

    // An operator moves the gmail organization to a paid plan mid-trial.
    await prisma.organization.update({
      where: { id: orgs.gmail },
      data: { metadata: JSON.stringify({ plan: "team" }) },
    })

    // Expiry, with overlapping runs
    const end = new Date(start.getTime() + 14 * DAY + 60_000)
    await Promise.all([processTrials(end), processTrials(end)])
    await processTrials(end)
    check(
      (await notifications(orgs.main, "trial.ended")) === 1,
      "end-of-trial notice is sent once over three (two concurrent) runs"
    )
    check(
      (await prisma.auditLog.count({
        where: { organizationId: orgs.main, action: "organization.trial.end" },
      })) === 1,
      "one organization.trial.end audit row is written"
    )
    // orgQuotaBytes reads the real clock: move the end into the real past.
    await prisma.organization.update({
      where: { id: orgs.main },
      data: { trialEndsAt: new Date(Date.now() - 1000) },
    })
    check(
      (await getOrganizationEntitlements(orgs.main)).storageBytes === 1 * GB,
      "workspace is back on Starter (1 GB)"
    )
    check(
      (await getOrganizationEntitlements(orgs.main)).seats === 5,
      "seats are back on the Starter cap"
    )
    check(
      (await getAiQuota(orgs.main, end)).budgetMicros === 0,
      "the AI allowance is gone after the trial"
    )
    check(
      (await prisma.notification.findUnique({ where: { id: trialRow.id } })) !==
        null,
      "data created during the trial is intact"
    )
    check(
      (await getTrialStatus(orgs.main, end))?.state === "ended",
      "settings card shows the trial as ended"
    )
    check(
      (await notifications(orgs.gmail, "trial.ended")) === 0 &&
        (await getOrganizationEntitlements(orgs.gmail)).storageBytes === 100 * GB,
      "an organization paid during the trial keeps Team and gets no end notice"
    )
  } finally {
    await prisma.organization
      .deleteMany({ where: { id: { in: Object.values(orgs) } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({
        where: { id: { in: Object.values(users).map((user) => user.id) } },
      })
      .catch(() => {})
    await prisma.trialClaim
      .deleteMany({ where: { email: { in: emails } } })
      .catch(() => {})
    await prisma.$disconnect()
  }

  if (failures > 0) {
    console.error(`\n${failures} trial check(s) failed`)
    process.exitCode = 1
  } else {
    console.log("\nAll trial checks passed")
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
