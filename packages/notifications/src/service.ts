import type { RequestContext } from "@workspace/core/context"

import type {
  NotificationItemData,
  NotificationType,
  NotificationsData,
} from "./types"

/** Arguments for a system notification emitted by another service. */
export interface NotifyArgs {
  organizationId: string
  /** Recipient. Notifications to yourself are skipped. */
  userId: string | null | undefined
  /** Null for system notifications (e.g. the trial-expiry cron). */
  actorId: string | null
  type: NotificationType
  data?: Record<string, unknown>
}

export interface NotificationRow {
  id: string
  type: string
  data: unknown
  readAt: Date | null
  createdAt: Date
}

/**
 * Storage contract for the notification inbox.
 *
 * Copilot owns the `Notification` table in its identity database and provides
 * this port; every other app calls `POST /internal/v1/notifications` instead
 * (see `NotificationClient` in `@workspace/contracts`).
 */
export interface NotificationRepositoryPort {
  list(
    organizationId: string,
    userId: string,
    limit: number
  ): Promise<NotificationRow[]>
  /**
   * Unread rows are counted per organization: the badge must not include
   * another workspace's notifications for the same user.
   */
  countUnread(organizationId: string, userId: string): Promise<number>
  create(data: {
    organizationId: string
    userId: string
    actorId: string | null
    type: string
    data?: unknown
  }): PromiseLike<unknown>
  markRead(
    organizationId: string,
    userId: string,
    id: string
  ): PromiseLike<unknown>
  markAllRead(organizationId: string, userId: string): PromiseLike<unknown>
}

export class NotificationService {
  constructor(private readonly repo: NotificationRepositoryPort) {}

  private map(row: NotificationRow): NotificationItemData {
    return {
      id: row.id,
      type: row.type as NotificationType,
      data:
        row.data && typeof row.data === "object" && !Array.isArray(row.data)
          ? (row.data as Record<string, unknown>)
          : {},
      readAt: row.readAt?.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }
  }

  async list(ctx: RequestContext, limit = 20): Promise<NotificationsData> {
    const [rows, unreadCount] = await Promise.all([
      this.repo.list(ctx.organizationId, ctx.userId, limit),
      this.repo.countUnread(ctx.organizationId, ctx.userId),
    ])
    return { items: rows.map((row) => this.map(row)), unreadCount }
  }

  async markRead(
    ctx: RequestContext,
    id: string
  ): Promise<{ unreadCount: number }> {
    await this.repo.markRead(ctx.organizationId, ctx.userId, id)
    return {
      unreadCount: await this.repo.countUnread(ctx.organizationId, ctx.userId),
    }
  }

  async markAllRead(ctx: RequestContext): Promise<{ unreadCount: number }> {
    await this.repo.markAllRead(ctx.organizationId, ctx.userId)
    return { unreadCount: 0 }
  }

  /**
   * Emit a notification from another service. Failures are logged and never
   * propagate: notifying is secondary to the action that triggered it.
   */
  async notify(args: NotifyArgs): Promise<void> {
    if (!args.userId || args.userId === args.actorId) return
    try {
      await this.repo.create({
        organizationId: args.organizationId,
        userId: args.userId,
        actorId: args.actorId,
        type: args.type,
        data: args.data,
      })
    } catch (error) {
      console.error("Failed to create notification", error)
    }
  }
}
