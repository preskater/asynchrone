import { parsePlan } from "@workspace/core/plans"
import {
  isTrialActive,
  trialClaimKeys,
  trialDaysLeft,
  trialEndsAtFrom,
  trialRefusal,
  trialStage,
} from "@workspace/core/trial"

import { AUDIT_ACTIONS } from "@/lib/audit/actions"
import { recordSystemAudit, recordUserAudit } from "@/lib/audit/record"
import type { RequestContext } from "@workspace/core/context"
import { requirePermission } from "@/lib/core/auth-context"
import { ConflictError, NotFoundError } from "@workspace/core/errors"
import { sendTrialEndedEmail, sendTrialReminderEmail } from "@/lib/email"
import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

const TRIAL_SELECT = {
  id: true,
  name: true,
  metadata: true,
  trialStartedAt: true,
  trialEndsAt: true,
  trialReminderSentAt: true,
  trialEndedAt: true,
} as const

export interface TrialStatus {
  /** Only free organizations see trial UI; paid plans get `null`. */
  state: "available" | "active" | "ended"
  daysLeft: number
  trialEndsAt: Date | null
}

export async function getTrialStatus(
  organizationId: string,
  now = new Date()
): Promise<TrialStatus | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: TRIAL_SELECT,
  })
  if (!org) return null
  const plan = parsePlan(org.metadata)
  if (plan !== "free") return null

  return {
    state: isTrialActive(org, now)
      ? "active"
      : org.trialStartedAt
        ? "ended"
        : "available",
    daysLeft: trialDaysLeft(org, now),
    trialEndsAt: org.trialEndsAt,
  }
}

export async function startTeamTrial(ctx: RequestContext, now = new Date()) {
  requirePermission(ctx, ["owner", "admin"])

  const [org, user] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: TRIAL_SELECT,
    }),
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, emailVerified: true },
    }),
  ])
  if (!org || !user) throw new NotFoundError("Organization")

  const keys = trialClaimKeys(user.email)
  const claim = await prisma.trialClaim.findFirst({
    where: {
      OR: [
        { email: keys.email },
        ...(keys.domain ? [{ domain: keys.domain }] : []),
      ],
    },
    select: { id: true },
  })

  const refusal = trialRefusal({
    plan: parsePlan(org.metadata),
    org,
    emailVerified: user.emailVerified,
    claimed: claim !== null,
  })
  if (refusal)
    throw new ConflictError("A Team trial cannot be started.", {
      code: refusal,
    })

  const trialEndsAt = trialEndsAtFrom(now)
  try {
    await prisma.$transaction(async (tx) => {
      // Conditional update: two concurrent starts cannot both win.
      const { count } = await tx.organization.updateMany({
        where: { id: org.id, trialStartedAt: null },
        data: { trialStartedAt: now, trialEndsAt },
      })
      if (count === 0) {
        throw new ConflictError("A Team trial cannot be started.", {
          code: "trial_already_used",
        })
      }
      await tx.trialClaim.create({
        data: {
          email: keys.email,
          domain: keys.domain,
          organizationId: org.id,
        },
      })
      await recordUserAudit(
        { ...ctx, organizationId: org.id },
        {
          action: AUDIT_ACTIONS.organizationTrialStart,
          entityType: "organization",
          entityId: org.id,
          after: { trialEndsAt: trialEndsAt.toISOString() },
        },
        tx
      )
    })
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new ConflictError("A Team trial cannot be started.", {
        code: "trial_already_claimed",
      })
    }
    throw error
  }

  return { trialEndsAt }
}

function pricingUrl() {
  return new URL("/pricing", process.env.BETTER_AUTH_URL).toString()
}

async function notifyAdmins(
  org: { id: string; name: string },
  type: "trial.reminder" | "trial.ended",
  daysLeft: number
) {
  const admins = await prisma.member.findMany({
    where: {
      organizationId: org.id,
      clientId: null,
      role: { in: ["owner", "admin"] },
    },
    select: { userId: true, user: { select: { email: true } } },
  })
  const url = pricingUrl()

  await Promise.all(
    admins.map(async ({ userId, user }) => {
      await notificationService.notify({
        organizationId: org.id,
        userId,
        actorId: null,
        type,
        data: { organizationName: org.name, daysLeft },
      })
      if (type === "trial.reminder") {
        sendTrialReminderEmail({
          to: user.email,
          organizationName: org.name,
          daysLeft,
          url,
        })
      } else {
        sendTrialEndedEmail({ to: user.email, organizationName: org.name, url })
      }
    })
  )
}

/**
 * Daily trial job: D-3 reminder, then expiry at `trialEndsAt`. Each step is
 * claimed with a conditional update, so overlapping or repeated runs never
 * notify twice. Expiry only records the end — the downgrade itself already
 * happened through `effectivePlan` — and never touches workspace data.
 */
export async function processTrials(now = new Date()) {
  const candidates = await prisma.organization.findMany({
    where: { trialEndsAt: { not: null }, trialEndedAt: null },
    select: TRIAL_SELECT,
  })

  let reminded = 0
  let expired = 0

  for (const org of candidates) {
    const stage = trialStage(org, now)
    if (!stage) continue
    // Paid in the meantime (control tower): close the trial without emails.
    const paid = parsePlan(org.metadata) !== "free"

    if (stage === "expire") {
      const { count } = await prisma.organization.updateMany({
        where: { id: org.id, trialEndedAt: null, trialEndsAt: { lte: now } },
        data: { trialEndedAt: now },
      })
      if (count === 0) continue
      expired++
      await recordSystemAudit({
        organizationId: org.id,
        action: AUDIT_ACTIONS.organizationTrialEnd,
        entityType: "organization",
        entityId: org.id,
        before: { plan: "team" },
        after: { plan: paid ? parsePlan(org.metadata) : "free" },
      })
      if (!paid) await notifyAdmins(org, "trial.ended", 0)
    } else {
      const { count } = await prisma.organization.updateMany({
        where: { id: org.id, trialReminderSentAt: null, trialEndedAt: null },
        data: { trialReminderSentAt: now },
      })
      if (count === 0) continue
      reminded++
      if (!paid)
        await notifyAdmins(org, "trial.reminder", trialDaysLeft(org, now))
    }
  }

  return { reminded, expired }
}
