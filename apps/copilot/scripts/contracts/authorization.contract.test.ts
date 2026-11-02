import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { contextForMember } from "@/lib/core/auth-context"
import { PortalService } from "@workspace/portal"
import { calendarService } from "@/lib/calendars"
import { clientsService } from "@/lib/clients"
import { employeesService } from "@/lib/employees"
import { fileService } from "@/lib/files"
import { meetingService } from "@/lib/meetings"
import { messagingService } from "@/lib/messaging"
import { notificationService } from "@/lib/notifications"
import { prisma } from "@/lib/prisma"
import { projectService } from "@/lib/projects"
import { searchWorkspace } from "@/lib/search"

import {
  createContractFixture,
  rejectionOf,
  type ContractFixture,
} from "./fixtures"

/**
 * Cross-organization and impersonation contract checks.
 *
 * Replays every attack from issue #40 against the package entrypoints Copilot
 * binds, then adds one cross-org read and/or write per domain package. Each
 * assertion inspects the database after the attempt, so a partial mutation
 * fails the suite even when the call itself throws.
 */
describe("cross-organization contracts", () => {
  let fixture: ContractFixture

  beforeAll(async () => {
    fixture = await createContractFixture()
  })

  afterAll(async () => {
    await fixture?.cleanup()
  })

  it("rejects a project read from another organization", async () => {
    await expect(
      projectService.get(fixture.ctxMallory, fixture.projectA)
    ).rejects.toMatchObject({ code: "not_found" })
    await expect(
      projectService.listTasks(fixture.ctxMallory, fixture.projectA)
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("issue #40: cannot toggle a subtask through a task of another org", async () => {
    const before = await prisma.subtask.findUniqueOrThrow({
      where: { id: fixture.subtaskA },
    })

    await rejectionOf(
      projectService.toggleSubtask(
        fixture.ctxMallory,
        fixture.projectB,
        fixture.subtaskA
      )
    )

    const after = await prisma.subtask.findUniqueOrThrow({
      where: { id: fixture.subtaskA },
    })
    expect(after.done).toBe(before.done)
  })

  it("issue #40: a non-member gets no context for another organization", async () => {
    const context = await rejectionOf(
      contextForMember(
        {
          id: fixture.users.mallory,
          name: "Mallory",
          email: `${fixture.users.mallory}@contract.local`,
        },
        fixture.orgA
      )
    )
    expect(context).toMatchObject({ code: "forbidden" })
  })

  it("issue #40: a portal account cannot get an internal context", async () => {
    const context = await rejectionOf(
      contextForMember(
        {
          id: fixture.users.portalB,
          name: "Portal B",
          email: `${fixture.users.portalB}@contract.local`,
        },
        fixture.orgB
      )
    )
    expect(context).toMatchObject({ code: "forbidden" })
  })

  it("issue #40: cannot react on behalf of another member", async () => {
    // The legacy payload carried `memberId`; the service must ignore it and
    // record the reaction for the authenticated caller only.
    await messagingService.toggleReaction(fixture.ctxBob, fixture.messageA, {
      emoji: "💩",
      memberId: fixture.users.alice,
    } as Parameters<typeof messagingService.toggleReaction>[2])

    const forged = await prisma.messageReaction.count({
      where: { messageId: fixture.messageA, userId: fixture.users.alice },
    })
    const own = await prisma.messageReaction.count({
      where: { messageId: fixture.messageA, userId: fixture.users.bob },
    })
    expect(forged).toBe(0)
    expect(own).toBe(1)
  })

  it("rejects messaging reads from another organization", async () => {
    await expect(
      messagingService.listMessages(fixture.ctxMallory, fixture.conversationA)
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("issue #40: cannot answer a calendar event on behalf of another member", async () => {
    // `memberId` in the legacy payload must not select the attendee.
    await calendarService.setAttendeeResponse(fixture.ctxBob, fixture.eventA, {
      response: "declined",
      memberId: fixture.users.alice,
    } as Parameters<typeof calendarService.setAttendeeResponse>[2])

    const attendee = await prisma.eventAttendee.findUniqueOrThrow({
      where: {
        eventId_userId: {
          eventId: fixture.eventA,
          userId: fixture.users.alice,
        },
      },
    })
    expect(attendee.response).toBe("accepted")
  })

  it("rejects calendar writes from another organization", async () => {
    await expect(
      calendarService.updateEvent(fixture.ctxMallory, fixture.eventA, {
        title: "Hijacked",
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("rejects client reads and writes from another organization", async () => {
    await expect(
      clientsService.getClientDetail(fixture.ctxMallory, fixture.clientA)
    ).rejects.toMatchObject({ code: "not_found" })

    await expect(
      clientsService.saveClient(fixture.ctxMallory, {
        id: fixture.clientA,
        name: "Hijacked",
        status: "active",
        isActive: true,
      })
    ).rejects.toMatchObject({ code: "not_found" })

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: fixture.clientA },
    })
    expect(client.name).toBe(`Acme ${fixture.suffix}`)
  })

  it("rejects employee writes across organizations", async () => {
    await expect(
      employeesService.decideLeave(fixture.ctxMallory, fixture.leaveA, {
        decision: "approved",
      })
    ).rejects.toMatchObject({ code: "not_found" })

    await expect(
      employeesService.setAttendance(fixture.ctxMallory, {
        date: "2026-12-08",
        period: "morning",
        status: "on_site",
        projectId: fixture.projectA,
      })
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("rejects file writes from another organization", async () => {
    await expect(
      fileService.renameFile(fixture.ctxMallory, fixture.fileA, {
        name: "hijacked.txt",
      })
    ).rejects.toMatchObject({ code: "not_found" })

    const file = await prisma.fileNode.findUniqueOrThrow({
      where: { id: fixture.fileA },
    })
    expect(file.name).toBe(`secret-file-${fixture.suffix}.txt`)
  })

  it("rejects meeting decisions from another organization", async () => {
    await expect(
      meetingService.acceptRequest(fixture.ctxMallory, {
        id: fixture.meetingRequestA,
        slotId: fixture.meetingSlotA,
      })
    ).rejects.toMatchObject({ code: "not_found" })

    const request = await prisma.meetingRequest.findUniqueOrThrow({
      where: { id: fixture.meetingRequestA },
    })
    expect(request.status).toBe("pending")
  })

  it("rejects portal reads for a company of another organization", async () => {
    // The production portal calls the projects internal API. The contract suite
    // has no browser and no domain app, so bind the same scoped query the
    // projects app runs; a project of another company is not found.
    const projects = {
      listProjects: async (organizationId: string, clientId: string) => {
        const rows = await prisma.project.findMany({
          where: { organizationId, clientId, clientVisible: true },
          select: {
            id: true,
            name: true,
            status: true,
            tasks: { select: { status: true } },
          },
        })
        return rows.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          dueDate: undefined,
          doneTasks: row.tasks.filter((task) => task.status === "done").length,
          totalTasks: row.tasks.length,
        }))
      },
      listUnreadMessages: async () => [],
      findProject: async (
        organizationId: string,
        clientId: string,
        projectId: string
      ) => {
        const row = await prisma.project.findFirst({
          where: {
            id: projectId,
            organizationId,
            clientId,
            clientVisible: true,
          },
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            dueDate: true,
            createdAt: true,
            clientDiscussion: true,
            clientTaskComments: true,
            tasks: {
              select: { id: true, title: true, status: true, dueDate: true },
            },
          },
        })
        if (!row) return null
        return {
          id: row.id,
          name: row.name,
          description: row.description ?? undefined,
          status: row.status,
          dueDate: row.dueDate?.toISOString(),
          createdAt: row.createdAt.toISOString(),
          tasks: row.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            status: task.status,
            dueDate: task.dueDate?.toISOString(),
          })),
          discussionPolicy: row.clientDiscussion as
            "none" | "read" | "read_write",
          taskCommentsPolicy: row.clientTaskComments as
            "none" | "read" | "read_write",
        }
      },
      findProjectPolicy: async () => null,
      findProjectTask: async () => null,
      findTask: async () => null,
    }
    const portal = new PortalService({
      repository: {} as never,
      storage: {} as never,
      files: {} as never,
      projects: projects as never,
      clientDocuments: {} as never,
      collaboration: {} as never,
      meetings: {} as never,
      invitations: {} as never,
      notify: async () => undefined,
    })

    await expect(
      portal.getProject(fixture.portalB, fixture.projectA)
    ).rejects.toMatchObject({ code: "not_found" })
  })

  it("scopes notifications to the active organization", async () => {
    const listed = await notificationService.list(fixture.ctxAlice)
    expect(listed.items.map((item) => item.id)).toContain(fixture.notificationA)

    const other = await notificationService.list(fixture.ctxMallory)
    expect(other.items).toEqual([])

    await notificationService.markRead(
      fixture.ctxMallory,
      fixture.notificationA
    )
    const untouched = await prisma.notification.findUniqueOrThrow({
      where: { id: fixture.notificationA },
    })
    expect(untouched.readAt).toBeNull()
  })

  it("only searches the active organization through the packages", async () => {
    const attacker = await searchWorkspace(
      fixture.ctxMallory,
      fixture.slugB,
      "Secret"
    )
    expect(attacker.results).toEqual([])

    const owner = await searchWorkspace(
      fixture.ctxAlice,
      fixture.slugA,
      "Secret"
    )
    expect(owner.results.length).toBeGreaterThan(0)
    expect(
      owner.results.every((result) =>
        result.url.startsWith(`/${fixture.slugA}/`)
      )
    ).toBe(true)
  })
})
