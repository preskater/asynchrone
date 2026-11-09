"use server"

import { revalidatePath } from "next/cache"

import { z } from "zod"

import type { AdminSupportTicketUpdate } from "@workspace/contracts"

import { withPlatformAction } from "@/lib/platform/action"
import { recordPlatformEvent } from "@/lib/platform/audit"
import { identityAdmin } from "@/lib/platform/identity"
import type { ActionResult } from "@/lib/platform/result"

const schema = z.object({
  ticketId: z.string().min(1).max(64),
  action: z.enum(["assign", "unassign", "acknowledge", "resolve", "reopen"]),
})

/**
 * Moves a support ticket through its lifecycle (#101). Working the queue is
 * the support role's job, so `platform_support` may do it; every change is in
 * the platform audit trail.
 */
export async function updateSupportTicket(
  input: unknown
): Promise<ActionResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid input." }

  const { ticketId, action } = parsed.data

  return withPlatformAction(async (ctx) => {
    const admin = identityAdmin()
    const before = await admin.getSupportTicket(ticketId)

    const update: AdminSupportTicketUpdate =
      action === "assign"
        ? { assigneeEmail: ctx.userEmail }
        : action === "unassign"
          ? { assigneeEmail: null }
          : action === "acknowledge"
            ? // Acknowledging takes ownership unless someone already has it.
              {
                status: "acknowledged",
                assigneeEmail: before.assigneeEmail ?? ctx.userEmail,
              }
            : action === "resolve"
              ? { status: "resolved" }
              : { status: "open" }

    const after = await admin.updateSupportTicket(ticketId, update)

    await recordPlatformEvent(ctx, {
      action: `support_ticket.${action}`,
      targetType: "support_ticket",
      targetId: ticketId,
      organizationId: after.organizationId,
      before: { status: before.status, assigneeEmail: before.assigneeEmail },
      after: { status: after.status, assigneeEmail: after.assigneeEmail },
    })

    revalidatePath(`/support/${ticketId}`)
    revalidatePath("/support")
    return { ok: true }
  })
}
