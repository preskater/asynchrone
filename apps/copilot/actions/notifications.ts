"use server"

import { withAction } from "@workspace/core/action"
import { getRequestContext } from "@/lib/core/auth-context"
import { parseLocalized } from "@/lib/core/validation-server"
import { notificationIdSchema, notificationService } from "@/lib/notifications"

export const fetchNotificationsAction = withAction(async () => {
  const ctx = await getRequestContext()
  return notificationService.list(ctx)
})

export const markNotificationReadAction = withAction(async (input: unknown) => {
  const ctx = await getRequestContext()
  const parsed = await parseLocalized(notificationIdSchema, input)
  return notificationService.markRead(ctx, parsed.id)
})

export const markAllNotificationsReadAction = withAction(async () => {
  const ctx = await getRequestContext()
  return notificationService.markAllRead(ctx)
})
