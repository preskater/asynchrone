import {
  INTERNAL_API_VERSION,
  NotificationInputSchema,
  SERVICE_SCOPES,
} from "@workspace/contracts"
import { prisma } from "@workspace/db-identity"

import { requireCopilotService } from "@/lib/internal/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function envelope(data: unknown, status = 200): Response {
  return Response.json(
    {
      data,
      meta: {
        app: "copilot",
        version: INTERNAL_API_VERSION,
        requestId: crypto.randomUUID(),
      },
    },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

function error(status: number, code: string, message: string): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  )
}

/**
 * Central notification ingress for domain apps.
 *
 * The receiver owns the notification row and its display data; the sender only
 * supplies an idempotency key. A retry with the same key returns
 * `created: false` instead of duplicating the notification.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    await requireCopilotService(request, SERVICE_SCOPES.notificationsWrite)
  } catch (cause) {
    const status =
      typeof cause === "object" &&
      cause !== null &&
      typeof (cause as { status?: unknown }).status === "number"
        ? (cause as { status: number }).status
        : 401
    const code =
      typeof cause === "object" &&
      cause !== null &&
      typeof (cause as { code?: unknown }).code === "string"
        ? (cause as { code: string }).code
        : "unauthorized"
    return error(status, code, "A valid service token is required")
  }

  let input
  try {
    input = NotificationInputSchema.parse(await request.json())
  } catch {
    return error(400, "validation_error", "Invalid notification payload")
  }

  const member = await prisma.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: input.organizationId,
        userId: input.userId,
      },
    },
    select: { id: true },
  })
  if (!member) {
    return error(
      404,
      "not_found",
      "Recipient is not a member of the organization"
    )
  }

  try {
    await prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        data: {
          title: input.title,
          ...(input.body ? { body: input.body } : {}),
          ...(input.url ? { url: input.url } : {}),
        },
      },
    })
    return envelope({ created: true })
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      (cause as { code?: string }).code === "P2002"
    ) {
      return envelope({ created: false })
    }
    console.error("[notifications] create failed", cause)
    return error(500, "internal_error", "Notification creation failed")
  }
}
