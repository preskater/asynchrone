import type { PrismaClient } from "@workspace/db"
import {
  NotificationService,
  type NotificationRepositoryPort,
  type NotificationRow,
} from "@workspace/notifications"

/**
 * Notification inbox for the calendars app.
 *
 * Calendars emits notifications only (client meeting requests); the inbox
 * itself stays in Copilot. Until #190 the app writes the row through the shared
 * client; the next step is
 * `POST /internal/v1/notifications` with a service token, which the provisioned
 * `CALENDARS_OAUTH_CLIENT_*` credentials already allow.
 */
class CalendarNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly db: PrismaClient) {}

  list(
    organizationId: string,
    userId: string,
    limit = 20
  ): Promise<NotificationRow[]> {
    return this.db.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    })
  }

  countUnread(organizationId: string, userId: string) {
    return this.db.notification.count({
      where: { organizationId, userId, readAt: null },
    })
  }

  create(data: {
    organizationId: string
    userId: string
    actorId: string | null
    type: string
    data?: unknown
  }) {
    return this.db.notification.create({
      data: { ...data, data: (data.data ?? undefined) as never },
    })
  }

  markRead(organizationId: string, userId: string, id: string) {
    return this.db.notification.updateMany({
      where: { id, organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    })
  }

  markAllRead(organizationId: string, userId: string) {
    return this.db.notification.updateMany({
      where: { organizationId, userId, readAt: null },
      data: { readAt: new Date() },
    })
  }
}

export function createNotificationService(
  db: PrismaClient
): NotificationService {
  return new NotificationService(new CalendarNotificationRepository(db))
}
