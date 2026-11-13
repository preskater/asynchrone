import type { PrismaClient } from "@workspace/db-identity"

import type {
  NotificationRepositoryPort,
  NotificationRow,
} from "@workspace/notifications"

export class NotificationRepository implements NotificationRepositoryPort {
  constructor(
    private readonly db: PrismaClient,
    /** Real-time hint for the recipient's open tabs (#98). */
    private readonly onCreated?: (
      organizationId: string,
      userId: string
    ) => Promise<void>
  ) {}

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

  async create(data: {
    organizationId: string
    userId: string
    actorId: string | null
    type: string
    data?: unknown
  }) {
    const row = await this.db.notification.create({
      data: { ...data, data: (data.data ?? undefined) as never },
    })
    await this.onCreated?.(data.organizationId, data.userId)
    return row
  }

  /**
   * Only the recipient can mark their own notifications as read, and only
   * from the organization they currently have open.
   */
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
