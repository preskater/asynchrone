import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePlatformContext: vi.fn(),
  recordPlatformEvent: vi.fn(),
  revalidatePath: vi.fn(),
  admin: {
    getSupportTicket: vi.fn(),
    updateSupportTicket: vi.fn(),
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock("@/lib/platform/guard", () => ({
  requirePlatformContext: mocks.requirePlatformContext,
}))
vi.mock("@/lib/platform/audit", () => ({
  recordPlatformEvent: mocks.recordPlatformEvent,
}))
vi.mock("@/lib/platform/identity", () => ({
  identityAdmin: () => mocks.admin,
}))

import { updateSupportTicket } from "./support"

const ctx = {
  userId: "op_2",
  userName: "Sam Support",
  userEmail: "sam@example.com",
  role: "platform_support" as const,
  sessionId: "session_1",
  twoFactorEnabled: true,
}

const ticket = {
  id: "ticket_1",
  organizationId: "org_1",
  status: "open" as const,
  assigneeEmail: null as string | null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePlatformContext.mockResolvedValue(ctx)
  mocks.admin.getSupportTicket.mockResolvedValue(ticket)
  mocks.admin.updateSupportTicket.mockImplementation(
    async (_id: string, input: Record<string, unknown>) => ({
      ...ticket,
      status: input.status ?? ticket.status,
      assigneeEmail:
        input.assigneeEmail === undefined
          ? ticket.assigneeEmail
          : (input.assigneeEmail as string | null),
    })
  )
})

async function run(action: string, assigneeEmail: string | null = null) {
  mocks.admin.getSupportTicket.mockResolvedValue({ ...ticket, assigneeEmail })
  return updateSupportTicket({ ticketId: "ticket_1", action })
}

describe("updateSupportTicket", () => {
  it("assigns the current operator", async () => {
    expect(await run("assign")).toEqual({ ok: true })
    expect(mocks.admin.updateSupportTicket).toHaveBeenCalledWith("ticket_1", {
      assigneeEmail: "sam@example.com",
    })
  })

  it("unassigns a ticket", async () => {
    await run("unassign", "someone@example.com")
    expect(mocks.admin.updateSupportTicket).toHaveBeenCalledWith("ticket_1", {
      assigneeEmail: null,
    })
  })

  it("takes ownership when acknowledging an unassigned ticket", async () => {
    await run("acknowledge")
    expect(mocks.admin.updateSupportTicket).toHaveBeenCalledWith("ticket_1", {
      status: "acknowledged",
      assigneeEmail: "sam@example.com",
    })
  })

  it("keeps an existing assignee when acknowledging", async () => {
    await run("acknowledge", "owner@example.com")
    expect(mocks.admin.updateSupportTicket).toHaveBeenCalledWith("ticket_1", {
      status: "acknowledged",
      assigneeEmail: "owner@example.com",
    })
  })

  it("resolves and reopens", async () => {
    await run("resolve")
    expect(mocks.admin.updateSupportTicket).toHaveBeenLastCalledWith(
      "ticket_1",
      { status: "resolved" }
    )

    await run("reopen")
    expect(mocks.admin.updateSupportTicket).toHaveBeenLastCalledWith(
      "ticket_1",
      { status: "open" }
    )
  })

  it("audits the transition and revalidates the queue", async () => {
    await run("resolve")

    expect(mocks.recordPlatformEvent).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        action: "support_ticket.resolve",
        targetType: "support_ticket",
        targetId: "ticket_1",
        organizationId: "org_1",
      })
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/support/ticket_1")
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/support")
  })

  it("rejects invalid input without touching the ticket", async () => {
    expect(
      await updateSupportTicket({ ticketId: "", action: "resolve" })
    ).toEqual({ ok: false, error: "Invalid input." })
    expect(
      await updateSupportTicket({ ticketId: "ticket_1", action: "closed" })
    ).toEqual({ ok: false, error: "Invalid input." })

    expect(mocks.admin.updateSupportTicket).not.toHaveBeenCalled()
    expect(mocks.recordPlatformEvent).not.toHaveBeenCalled()
  })
})
