import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"

import { createContractFixture, type ContractFixture } from "./fixtures"

// The notification ingress verifies a service token. The contract under test
// is tenant scoping, so the token check is replaced with a pass-through.
vi.mock("@/lib/internal/service", () => ({
  requireCopilotService: vi.fn(async () => undefined),
}))

import { POST } from "@/app/internal/v1/notifications/route"

function payload(overrides: Record<string, unknown> = {}) {
  return {
    organizationId: "org_a",
    userId: "user_1",
    type: "task.assigned",
    title: "Review the spec",
    idempotencyKey: randomUUID(),
    ...overrides,
  }
}

describe("notification contracts", () => {
  let fixture: ContractFixture
  let secondOrgId: string

  beforeAll(async () => {
    fixture = await createContractFixture()
    secondOrgId = `org_contract_second_${randomUUID().slice(0, 8)}`
    await prisma.organization.create({
      data: {
        id: secondOrgId,
        name: "Second workspace",
        slug: `second-${randomUUID().slice(0, 8)}`,
        createdAt: new Date(),
      },
    })
    await prisma.member.create({
      data: {
        id: `member_second_${randomUUID().slice(0, 8)}`,
        organizationId: secondOrgId,
        userId: fixture.users.alice,
        role: "member",
        createdAt: new Date(),
      },
    })
  })

  afterAll(async () => {
    await prisma.organization
      .deleteMany({ where: { id: secondOrgId } })
      .catch(() => {})
    await fixture?.cleanup()
  })

  it("rejects a recipient who is not a member of the organization", async () => {
    const response = await POST(
      new Request("https://copilot.example/internal/v1/notifications", {
        method: "POST",
        body: JSON.stringify(
          payload({
            organizationId: fixture.orgA,
            userId: fixture.users.mallory,
          })
        ),
      })
    )

    expect(response.status).toBe(404)
    expect(
      await prisma.notification.count({
        where: { userId: fixture.users.mallory, organizationId: fixture.orgA },
      })
    ).toBe(0)
  })

  it("creates once per idempotency key", async () => {
    const idempotencyKey = `contract-${randomUUID()}`
    const body = JSON.stringify(
      payload({
        organizationId: fixture.orgA,
        userId: fixture.users.bob,
        idempotencyKey,
      })
    )

    const first = await POST(
      new Request("https://copilot.example/internal/v1/notifications", {
        method: "POST",
        body,
      })
    )
    const second = await POST(
      new Request("https://copilot.example/internal/v1/notifications", {
        method: "POST",
        body,
      })
    )

    expect((await first.json()).data).toEqual({ created: true })
    expect((await second.json()).data).toEqual({ created: false })
    expect(
      await prisma.notification.count({
        where: { organizationId: fixture.orgA, idempotencyKey },
      })
    ).toBe(1)
  })

  it("keeps the inbox and read state scoped to one organization", async () => {
    const otherNotification = await prisma.notification.create({
      data: {
        organizationId: secondOrgId,
        userId: fixture.users.alice,
        type: "task.assigned",
        data: { title: "Other workspace" },
      },
    })

    const listed = await notificationService.list(fixture.ctxAlice)
    expect(listed.unreadCount).toBe(1)
    expect(listed.items.map((item) => item.id)).not.toContain(
      otherNotification.id
    )

    await notificationService.markAllRead(fixture.ctxAlice)

    const inActiveOrg = await prisma.notification.findUniqueOrThrow({
      where: { id: fixture.notificationA },
    })
    const inOtherOrg = await prisma.notification.findUniqueOrThrow({
      where: { id: otherNotification.id },
    })
    expect(inActiveOrg.readAt).not.toBeNull()
    expect(inOtherOrg.readAt).toBeNull()
  })
})
