import { describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import {
  NotificationService,
  type NotificationRepositoryPort,
  type NotificationRow,
} from "./service"

const ctx: RequestContext = {
  userId: "user_1",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  role: "member",
}

function fakeRepository(
  overrides: Partial<NotificationRepositoryPort> = {}
): NotificationRepositoryPort {
  return {
    list: vi.fn(async () => [] as NotificationRow[]),
    countUnread: vi.fn(async () => 0),
    create: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    markAllRead: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe("NotificationService", () => {
  it("maps stored rows and counts unread notifications", async () => {
    const repo = fakeRepository({
      list: vi.fn(async () => [
        {
          id: "n1",
          type: "task.assigned",
          data: { title: "Review the spec" },
          readAt: null,
          createdAt: new Date("2026-11-01T10:00:00Z"),
        },
      ]),
      countUnread: vi.fn(async () => 1),
    })

    await expect(new NotificationService(repo).list(ctx)).resolves.toEqual({
      items: [
        {
          id: "n1",
          type: "task.assigned",
          data: { title: "Review the spec" },
          readAt: undefined,
          createdAt: "2026-11-01T10:00:00.000Z",
        },
      ],
      unreadCount: 1,
    })
    expect(repo.list).toHaveBeenCalledWith("org_1", "user_1", 20)
    expect(repo.countUnread).toHaveBeenCalledWith("org_1", "user_1")
  })

  it("skips self-notifications and missing recipients", async () => {
    const repo = fakeRepository()
    const service = new NotificationService(repo)

    await service.notify({
      organizationId: "org_1",
      userId: "user_1",
      actorId: "user_1",
      type: "task.assigned",
    })
    await service.notify({
      organizationId: "org_1",
      userId: null,
      actorId: "user_1",
      type: "task.assigned",
    })

    expect(repo.create).not.toHaveBeenCalled()
  })

  it("does not fail the triggering action when the write fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const repo = fakeRepository({
      create: vi.fn(async () => {
        throw new Error("database is down")
      }),
    })

    await expect(
      new NotificationService(repo).notify({
        organizationId: "org_1",
        userId: "user_2",
        actorId: null,
        type: "trial.reminder",
        data: { title: "Trial ends soon" },
      })
    ).resolves.toBeUndefined()

    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it("marks one notification and returns the new unread count", async () => {
    const repo = fakeRepository({ countUnread: vi.fn(async () => 2) })

    await expect(
      new NotificationService(repo).markRead(ctx, "n1")
    ).resolves.toEqual({ unreadCount: 2 })
    expect(repo.markRead).toHaveBeenCalledWith("org_1", "user_1", "n1")
  })
})
