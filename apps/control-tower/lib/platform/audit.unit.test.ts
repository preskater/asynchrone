import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ create: vi.fn() }))

vi.mock("@workspace/db-control-tower", () => ({
  prisma: { platformAuditEvent: { create: mocks.create } },
}))

import { recordPlatformEvent } from "./audit"
import type { PlatformContext } from "./guard"

const ctx: PlatformContext = {
  userId: "user_1",
  userName: "Op",
  userEmail: "op@example.com",
  role: "platform_admin",
  sessionId: "session_1",
  twoFactorEnabled: true,
}

const input = { action: "user.ban", targetType: "user", targetId: "user_2" }

beforeEach(() => {
  mocks.create.mockReset()
})

describe("recordPlatformEvent", () => {
  it("records the actor and defaults optional fields to null", async () => {
    mocks.create.mockResolvedValue({})
    await recordPlatformEvent(ctx, { ...input, after: { banned: true } })
    expect(mocks.create).toHaveBeenCalledWith({
      data: {
        ...input,
        actorId: "user_1",
        actorEmail: "op@example.com",
        actorRole: "platform_admin",
        organizationId: null,
        before: undefined,
        after: { banned: true },
        ipAddress: null,
        userAgent: null,
      },
    })
  })

  it("logs a failed write instead of throwing", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.create.mockRejectedValue(new Error("db down"))
    await expect(recordPlatformEvent(ctx, input)).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledOnce()
    error.mockRestore()
  })
})
