"use server"

import { revalidatePath } from "next/cache"

import { z } from "zod"

import { withPlatformAction } from "@/lib/platform/action"
import { recordPlatformEvent } from "@/lib/platform/audit"
import { identityAdmin } from "@/lib/platform/identity"
import type { ActionResult } from "@/lib/platform/result"

const planSchema = z.object({
  organizationId: z.string().min(1).max(64),
  plan: z.enum(["free", "team", "enterprise"]),
  quotaBytes: z.number().int().positive().nullable(),
})

export async function updateOrganizationPlan(
  input: unknown
): Promise<ActionResult> {
  const parsed = planSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid input." }

  const { organizationId, plan, quotaBytes } = parsed.data

  return withPlatformAction(async (ctx) => {
    if (ctx.role !== "platform_admin") {
      return { ok: false, error: "Only platform admins can change plans." }
    }

    const admin = identityAdmin()
    const organization = await admin.getOrganization(organizationId)
    if (!organization) return { ok: false, error: "Organization not found." }

    const updated = await admin.updatePlan(organizationId, {
      plan,
      quotaBytes,
    })

    await recordPlatformEvent(ctx, {
      action: "organization.plan.update",
      targetType: "organization",
      targetId: organizationId,
      organizationId,
      before: {
        plan: organization.plan,
        status: organization.subscriptionStatus ?? "inactive",
        manualOverride: organization.manualOverride,
        storageQuotaBytes: organization.storageQuotaBytes,
      },
      after: {
        plan: updated.plan,
        status: updated.subscriptionStatus ?? "inactive",
        manualOverride: updated.manualOverride,
        storageQuotaBytes: updated.storageQuotaBytes,
      },
    })

    revalidatePath(`/organizations/${organizationId}`)
    revalidatePath("/organizations")
    return { ok: true }
  })
}

const oauthClientSchema = z.object({
  clientId: z.string().min(1).max(200),
  disabled: z.boolean(),
})

export async function setOAuthClientDisabled(
  input: unknown
): Promise<ActionResult> {
  const parsed = oauthClientSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid input." }

  const { clientId, disabled } = parsed.data

  return withPlatformAction(async (ctx) => {
    if (ctx.role !== "platform_admin") {
      return {
        ok: false,
        error: "Only platform admins can manage OAuth clients.",
      }
    }

    const admin = identityAdmin()
    const client = await admin.getOAuthClient(clientId)
    if (!client) return { ok: false, error: "OAuth client not found." }

    const updated = await admin.setOAuthClientDisabled(clientId, { disabled })

    await recordPlatformEvent(ctx, {
      action: disabled ? "oauth-client.disable" : "oauth-client.enable",
      targetType: "oauth_client",
      targetId: clientId,
      before: { disabled: client.disabled, name: client.name },
      after: { disabled: updated.disabled, name: updated.name },
    })

    revalidatePath("/organizations")
    revalidatePath("/users")
    return { ok: true }
  })
}

const releaseSchema = z.object({
  organizationId: z.string().min(1).max(64),
})

/**
 * Gives the plan back to the payment provider. Keeps the current plan until
 * the next webhook reconciles it, so releasing never silently downgrades a
 * customer mid-period.
 */
export async function releaseOrganizationPlanOverride(
  input: unknown
): Promise<ActionResult> {
  const parsed = releaseSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid input." }

  const { organizationId } = parsed.data

  return withPlatformAction(async (ctx) => {
    if (ctx.role !== "platform_admin") {
      return { ok: false, error: "Only platform admins can change plans." }
    }

    const admin = identityAdmin()
    const organization = await admin.getOrganization(organizationId)
    if (!organization) {
      return { ok: false, error: "Organization not found." }
    }
    if (!organization.manualOverride) {
      return { ok: false, error: "This plan is not manually overridden." }
    }

    const updated = await admin.releasePlan(organizationId)

    await recordPlatformEvent(ctx, {
      action: "organization.plan.release",
      targetType: "organization",
      targetId: organizationId,
      organizationId,
      before: {
        plan: organization.plan,
        status: organization.subscriptionStatus,
        manualOverride: true,
      },
      after: {
        plan: updated.plan,
        status: updated.subscriptionStatus,
        manualOverride: updated.manualOverride,
      },
    })

    revalidatePath(`/organizations/${organizationId}`)
    revalidatePath("/organizations")
    return { ok: true }
  })
}
