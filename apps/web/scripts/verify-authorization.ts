import "dotenv/config"

import { randomUUID } from "node:crypto"

import { CalendarRepository, CalendarService } from "@workspace/calendars"
import { contextForMember } from "../lib/core/auth-context"
import type { RequestContext } from "@workspace/core/context"
import { MessagingRepository } from "../lib/messaging/repository"
import { MessagingService } from "../lib/messaging/service"
import { prisma } from "../lib/prisma"
import { ProjectRepository } from "../lib/projects/repository"
import { ProjectService } from "../lib/projects/service"

/**
 * Manual check for the authorization edge cases of issue #40, against two
 * throwaway organizations in the configured database. Each attack is run for
 * real and the database is inspected afterwards. Run with:
 *
 *   npm run verify:authorization
 */

let failures = 0

function report(blocked: boolean, message: string) {
  if (!blocked) failures++
  console.log(`${blocked ? "✓ blocked   " : "✗ VULNERABLE"} ${message}`)
}

async function main() {
  const suffix = randomUUID().slice(0, 8)
  const orgA = `org_authz_a_${suffix}`
  const orgB = `org_authz_b_${suffix}`
  const users = {
    alice: `user_authz_alice_${suffix}`, // member of A
    bob: `user_authz_bob_${suffix}`, // member of A
    mallory: `user_authz_mallory_${suffix}`, // owner of B, stranger to A
  }

  try {
    for (const [name, id] of Object.entries(users)) {
      await prisma.user.create({
        data: { id, name, email: `${id}@verify.local` },
      })
    }
    for (const [id, slug] of [
      [orgA, `authz-a-${suffix}`],
      [orgB, `authz-b-${suffix}`],
    ] as const) {
      await prisma.organization.create({
        data: { id, name: slug, slug, createdAt: new Date() },
      })
    }
    const memberships = [
      [orgA, users.alice, "member"],
      [orgA, users.bob, "member"],
      [orgB, users.mallory, "owner"],
    ] as const
    for (const [organizationId, userId, role] of memberships) {
      await prisma.member.create({
        data: {
          id: `member_${userId}_${organizationId}`,
          organizationId,
          userId,
          role,
          createdAt: new Date(),
        },
      })
    }

    const ctx = (userId: string, organizationId: string): RequestContext => ({
      userId,
      userName: userId,
      userEmail: `${userId}@verify.local`,
      organizationId,
      role: "member",
    })
    const bobInA = ctx(users.bob, orgA)
    const malloryInB = { ...ctx(users.mallory, orgB), role: "owner" as const }

    // 1. Cross-org subtask toggle: Mallory passes her own task id (B) with a
    //    subtask id that belongs to a task of organization A.
    const projects = new ProjectService(new ProjectRepository(prisma), prisma)
    const projectA = await prisma.project.create({
      data: { organizationId: orgA, name: "Secret A" },
    })
    const projectB = await prisma.project.create({
      data: { organizationId: orgB, name: "Mallory B" },
    })
    const taskA = await prisma.task.create({
      data: {
        organizationId: orgA,
        projectId: projectA.id,
        identifier: "A-1",
        title: "A task",
        subtasks: { create: { title: "Alice's subtask" } },
      },
      include: { subtasks: true },
    })
    const taskB = await prisma.task.create({
      data: {
        organizationId: orgB,
        projectId: projectB.id,
        identifier: "B-1",
        title: "B task",
      },
    })
    const victimSubtask = taskA.subtasks[0]!
    await projects
      .toggleSubtask(malloryInB, taskB.id, victimSubtask.id)
      .catch(() => {})
    const afterToggle = await prisma.subtask.findUniqueOrThrow({
      where: { id: victimSubtask.id },
    })
    report(
      afterToggle.done === victimSubtask.done,
      "org B owner cannot toggle a subtask of org A"
    )

    // 2. Context for an organization the user is not a member of.
    const strangerCtx = await contextForMember(
      { id: users.mallory, name: "mallory", email: "m@verify.local" },
      orgA
    ).catch(() => null)
    report(
      strangerCtx === null,
      `non-member gets no context for org A${strangerCtx ? ` (got role "${strangerCtx.role}")` : ""}`
    )

    // 3. Reaction on behalf of another member: Bob reacts as Alice.
    const messaging = new MessagingService(new MessagingRepository(prisma))
    const conversation = await prisma.conversation.create({
      data: { organizationId: orgA, name: "general" },
    })
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        authorId: users.alice,
        body: "hi",
      },
    })
    await messaging
      .toggleReaction(bobInA, message.id, {
        emoji: "💩",
        memberId: users.alice,
      } as Parameters<MessagingService["toggleReaction"]>[2])
      .catch(() => {})
    const forged = await prisma.messageReaction.count({
      where: { messageId: message.id, userId: users.alice },
    })
    report(forged === 0, "member cannot react on behalf of another member")

    // 4. Event response on behalf of another member: Bob declines for Alice.
    const calendars = new CalendarService(new CalendarRepository(prisma))
    const calendar = await prisma.calendar.create({
      data: { organizationId: orgA, name: "Team" },
    })
    const event = await prisma.calendarEvent.create({
      data: {
        organizationId: orgA,
        calendarId: calendar.id,
        title: "Review",
        startAt: new Date(),
        endAt: new Date(Date.now() + 3_600_000),
        createdBy: users.alice,
        attendees: { create: { userId: users.alice, response: "accepted" } },
      },
    })
    await calendars
      .setAttendeeResponse(bobInA, event.id, {
        memberId: users.alice,
        response: "declined",
      } as Parameters<CalendarService["setAttendeeResponse"]>[2])
      .catch(() => {})
    const aliceAttendance = await prisma.eventAttendee.findUniqueOrThrow({
      where: { eventId_userId: { eventId: event.id, userId: users.alice } },
    })
    report(
      aliceAttendance.response === "accepted",
      "member cannot answer an event on behalf of another member"
    )
  } finally {
    await prisma.organization
      .deleteMany({ where: { id: { in: [orgA, orgB] } } })
      .catch(() => {})
    await prisma.user
      .deleteMany({ where: { id: { in: Object.values(users) } } })
      .catch(() => {})
    await prisma.$disconnect()
  }

  if (failures > 0) {
    console.error(`\n${failures} authorization check(s) failed`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
