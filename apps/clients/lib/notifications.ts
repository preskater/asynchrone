import type { PrismaClient } from "@workspace/db"

import { prisma } from "@/lib/prisma"
import {
  NotificationService,
  type NotificationRepositoryPort,
  type NotificationRow,
} from "@workspace/notifications"

/**
 * Notification inbox for the clients app.
 *
 * Projects emits notifications only (the inbox itself stays in Copilot). Until
 * #190 the pilot writes the row through the shared client; the next step is
 * `POST /internal/v1/notifications` with a service token, which the provisioned
 * `PROJECTS_OAUTH_CLIENT_*` credentials already allow.
 */
class ClientNotificationRepository implements NotificationRepositoryPort {
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
  return new NotificationService(new ClientNotificationRepository(db))
}

/** The inbox service this app emits domain notifications through. */
export const notificationService = createNotificationService(prisma)
