/** Notification types and payloads exchanged with the client. */

export const NOTIFICATION_TYPES = [
  "task.assigned",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "portal.message",
  "portal.document",
  "portal.comment",
  "meeting.requested",
  "trial.reminder",
  "trial.ended",
  "billing.payment_failed",
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface NotificationItemData {
  id: string
  type: NotificationType
  /** Type-specific interpolation values (names, ids, identifiers). */
  data: Record<string, unknown>
  readAt?: string
  createdAt: string
}

export interface NotificationsData {
  items: NotificationItemData[]
  unreadCount: number
}
