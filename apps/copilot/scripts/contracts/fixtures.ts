import { randomUUID } from "node:crypto"

import type { RequestContext } from "@workspace/core/context"
import type { PortalContext } from "@workspace/portal/types"

import { prisma } from "@/lib/prisma"

/**
 * Two throwaway organizations used by the cross-domain contract suite.
 *
 * Organization A owns every fixture a domain might leak; organization B is the
 * attacker's workspace. Every id is read through the real Prisma client so a
 * test failure points at the package boundary, not at a mock.
 */
export interface ContractFixture {
  suffix: string
  orgA: string
  orgB: string
  slugA: string
  slugB: string
  users: {
    alice: string
    bob: string
    mallory: string
    portalB: string
  }
  clientA: string
  clientB: string
  projectA: string
  projectB: string
  taskA: string
  subtaskA: string
  conversationA: string
  conversationB: string
  messageA: string
  calendarA: string
  eventA: string
  fileA: string
  dealA: string
  leaveA: string
  meetingRequestA: string
  meetingSlotA: string
  notificationA: string
  ctxAlice: RequestContext
  ctxBob: RequestContext
  ctxMallory: RequestContext
  portalB: PortalContext
  cleanup: () => Promise<void>
}

export async function createContractFixture(): Promise<ContractFixture> {
  const suffix = randomUUID().slice(0, 8)
  const orgA = `org_contract_a_${suffix}`
  const orgB = `org_contract_b_${suffix}`
  const slugA = `contract-a-${suffix}`
  const slugB = `contract-b-${suffix}`
  const users = {
    alice: `user_contract_alice_${suffix}`,
    bob: `user_contract_bob_${suffix}`,
    mallory: `user_contract_mallory_${suffix}`,
    portalB: `user_contract_portal_b_${suffix}`,
  }

  try {
    await prisma.user.createMany({
      data: Object.values(users).map((id) => ({
        id,
        name: id,
        email: `${id}@contract.local`,
      })),
    })
    await prisma.organization.createMany({
      data: [
        {
          id: orgA,
          name: `Contract A ${suffix}`,
          slug: slugA,
          createdAt: new Date(),
        },
        {
          id: orgB,
          name: `Contract B ${suffix}`,
          slug: slugB,
          createdAt: new Date(),
        },
      ],
    })

    const clientA = await prisma.client.create({
      data: { organizationId: orgA, name: `Acme ${suffix}` },
    })
    const clientB = await prisma.client.create({
      data: { organizationId: orgB, name: `Globex ${suffix}` },
    })

    await prisma.member.createMany({
      data: [
        {
          id: `member_alice_${suffix}`,
          organizationId: orgA,
          userId: users.alice,
          role: "member",
          createdAt: new Date(),
        },
        {
          id: `member_bob_${suffix}`,
          organizationId: orgA,
          userId: users.bob,
          role: "member",
          createdAt: new Date(),
        },
        {
          id: `member_mallory_${suffix}`,
          organizationId: orgB,
          userId: users.mallory,
          role: "owner",
          createdAt: new Date(),
        },
        {
          id: `member_portal_b_${suffix}`,
          organizationId: orgB,
          userId: users.portalB,
          role: "client",
          clientId: clientB.id,
          createdAt: new Date(),
        },
      ],
    })

    const [projectA, projectB] = await Promise.all([
      prisma.project.create({
        data: {
          organizationId: orgA,
          clientId: clientA.id,
          name: `Secret project ${suffix}`,
          clientVisible: true,
        },
      }),
      prisma.project.create({
        data: {
          organizationId: orgB,
          name: `Mallory project ${suffix}`,
        },
      }),
    ])
    const taskA = await prisma.task.create({
      data: {
        organizationId: orgA,
        projectId: projectA.id,
        identifier: `A-${suffix}`,
        title: `Secret task ${suffix}`,
        subtasks: { create: { title: "Alice's subtask" } },
      },
      include: { subtasks: true },
    })
    await prisma.task.create({
      data: {
        organizationId: orgB,
        projectId: projectB.id,
        identifier: `B-${suffix}`,
        title: `Mallory task ${suffix}`,
      },
    })

    const conversationA = await prisma.conversation.create({
      data: {
        organizationId: orgA,
        name: `secret-channel-${suffix}`,
        members: {
          create: [{ userId: users.alice }, { userId: users.bob }],
        },
      },
    })
    const conversationB = await prisma.conversation.create({
      data: {
        organizationId: orgB,
        name: `mallory-channel-${suffix}`,
        members: { create: [{ userId: users.mallory }] },
      },
    })
    const messageA = await prisma.message.create({
      data: {
        conversationId: conversationA.id,
        authorId: users.alice,
        body: `secret message ${suffix}`,
      },
    })

    const calendarA = await prisma.calendar.create({
      data: {
        organizationId: orgA,
        name: `Secret calendar ${suffix}`,
        members: { create: [{ userId: users.alice }] },
      },
    })
    const eventA = await prisma.calendarEvent.create({
      data: {
        organizationId: orgA,
        calendarId: calendarA.id,
        title: `Secret review ${suffix}`,
        startAt: new Date(Date.now() + 3_600_000),
        endAt: new Date(Date.now() + 7_200_000),
        createdBy: users.alice,
        attendees: { create: { userId: users.alice, response: "accepted" } },
      },
    })

    const fileA = await prisma.fileNode.create({
      data: {
        organizationId: orgA,
        name: `secret-file-${suffix}.txt`,
        kind: "text",
        ownerId: users.alice,
      },
    })

    const dealA = await prisma.deal.create({
      data: {
        organizationId: orgA,
        clientId: clientA.id,
        name: `Secret deal ${suffix}`,
        amount: 1000,
      },
    })

    const leaveA = await prisma.leaveRequest.create({
      data: {
        organizationId: orgA,
        userId: users.alice,
        type: "paid_leave",
        status: "pending",
        startDate: new Date("2026-12-07T00:00:00.000Z"),
        endDate: new Date("2026-12-07T00:00:00.000Z"),
        startPeriod: "morning",
        endPeriod: "afternoon",
        halfDays: 2,
      },
    })

    const meetingSlotA = {
      startAt: new Date(Date.now() + 86_400_000),
      endAt: new Date(Date.now() + 90_000_000),
    }
    const meetingRequestA = await prisma.meetingRequest.create({
      data: {
        organizationId: orgA,
        clientId: clientA.id,
        title: `Secret meeting ${suffix}`,
        requestedById: users.alice,
        requestedByName: "Alice",
        slots: { create: [{ ...meetingSlotA, position: 0 }] },
      },
      include: { slots: true },
    })

    const notificationA = await prisma.notification.create({
      data: {
        organizationId: orgA,
        userId: users.alice,
        actorId: users.bob,
        type: "task.assigned",
        data: { title: `Secret notification ${suffix}` },
      },
    })

    const ctx = (
      userId: string,
      organizationId: string,
      role: RequestContext["role"]
    ): RequestContext => ({
      userId,
      userName: userId,
      userEmail: `${userId}@contract.local`,
      organizationId,
      role,
    })

    return {
      suffix,
      orgA,
      orgB,
      slugA,
      slugB,
      users,
      clientA: clientA.id,
      clientB: clientB.id,
      projectA: projectA.id,
      projectB: projectB.id,
      taskA: taskA.id,
      subtaskA: taskA.subtasks[0]!.id,
      conversationA: conversationA.id,
      conversationB: conversationB.id,
      messageA: messageA.id,
      calendarA: calendarA.id,
      eventA: eventA.id,
      fileA: fileA.id,
      dealA: dealA.id,
      leaveA: leaveA.id,
      meetingRequestA: meetingRequestA.id,
      meetingSlotA: meetingRequestA.slots[0]!.id,
      notificationA: notificationA.id,
      ctxAlice: ctx(users.alice, orgA, "member"),
      ctxBob: ctx(users.bob, orgA, "member"),
      ctxMallory: ctx(users.mallory, orgB, "owner"),
      portalB: {
        userId: users.portalB,
        userName: "Portal B",
        userEmail: `${users.portalB}@contract.local`,
        organizationId: orgB,
        organizationName: `Contract B ${suffix}`,
        organizationSlug: slugB,
        clientId: clientB.id,
        clientName: `Globex ${suffix}`,
      },
      cleanup: async () => {
        await prisma.organization
          .deleteMany({ where: { id: { in: [orgA, orgB] } } })
          .catch(() => {})
        await prisma.user
          .deleteMany({ where: { id: { in: Object.values(users) } } })
          .catch(() => {})
      },
    }
  } catch (error) {
    await prisma.organization
      .deleteMany({ where: { id: { in: [orgA, orgB] } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { id: { in: Object.values(users) } } })
      .catch(() => {})
    throw error
  }
}

/** Assert that a promise rejects; returns the error for assertions. */
export async function rejectionOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work
  } catch (error) {
    return error
  }
  throw new Error("Expected the call to be rejected")
}
