import { describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type {
  MeetingRepositoryPort,
  MeetingRequestRow,
  MeetingSettingsRow,
} from "./repository"
import { MeetingService, type MeetingNotifier } from "./service"

const HOUR_MS = 60 * 60 * 1000

const ctx: RequestContext = {
  userId: "user_ada",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  role: "member",
}

const portal = {
  userId: "user_client",
  userName: "Cara Client",
  organizationId: "org_1",
  clientId: "client_1",
  clientName: "Acme",
}

function settingsRow(
  overrides: Partial<MeetingSettingsRow> = {}
): MeetingSettingsRow {
  return {
    id: "settings_1",
    organizationId: "org_1",
    clientRequestsEnabled: true,
    autoDeclineOverlaps: true,
    bookingWindowDays: 30,
    minNoticeHours: 24,
    defaultDurationMinutes: 30,
    maxDurationMinutes: 120,
    provider: "manual",
    createdAt: new Date("2026-11-01T09:00:00Z"),
    updatedAt: new Date("2026-11-01T09:00:00Z"),
    ...overrides,
  }
}

function requestRow(
  overrides: Partial<MeetingRequestRow> = {}
): MeetingRequestRow {
  return {
    id: "request_1",
    organizationId: "org_1",
    clientId: "client_1",
    client: { id: "client_1", name: "Acme" },
    title: "Kickoff",
    description: null,
    mode: "online",
    meetingUrl: "https://meet.example.com/kickoff",
    meetingPassword: null,
    address: null,
    status: "pending",
    requestedById: portal.userId,
    requestedByName: portal.userName,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    decisionNote: null,
    calendarEventId: null,
    provider: "manual",
    externalMeetingId: null,
    externalJoinUrl: null,
    createdAt: new Date("2026-11-01T09:00:00Z"),
    updatedAt: new Date("2026-11-01T09:00:00Z"),
    slots: [
      {
        id: "slot_1",
        requestId: "request_1",
        startAt: new Date(Date.now() + 72 * HOUR_MS),
        endAt: new Date(Date.now() + 72 * HOUR_MS + 30 * 60 * 1000),
        position: 0,
        selected: false,
      },
      {
        id: "slot_2",
        requestId: "request_1",
        startAt: new Date(Date.now() + 96 * HOUR_MS),
        endAt: new Date(Date.now() + 96 * HOUR_MS + 30 * 60 * 1000),
        position: 1,
        selected: false,
      },
    ],
    ...overrides,
  }
}

function fakeRepository(
  overrides: Partial<MeetingRepositoryPort> = {}
): MeetingRepositoryPort {
  return {
    getSettings: vi.fn(async () => settingsRow()),
    upsertSettings: vi.fn(async () => settingsRow()),
    listRequests: vi.fn(async () => []),
    listClientRequests: vi.fn(async () => []),
    findRequest: vi.fn(async () => null),
    findClientRequest: vi.fn(async () => null),
    createRequest: vi.fn(async () => requestRow()),
    updateRequest: vi.fn(async () => requestRow()),
    findSlotConflicts: vi.fn(
      async (_organizationId: string, slots: { startAt: Date }[]) =>
        slots.map(() => false)
    ),
    listTeamEvents: vi.fn(async () => []),
    findCalendar: vi.fn(async () => ({
      id: "cal_team",
      name: "Team meetings",
    })),
    ensureTeamCalendar: vi.fn(async () => ({
      id: "cal_team",
      name: "Team meetings",
    })),
    bookRequest: vi.fn(async () => requestRow({ status: "accepted" })),
    listManagers: vi.fn(async () => [
      { userId: "user_owner", role: "owner" },
      { userId: portal.userId, role: "client" },
    ]),
    findInternalMembers: vi.fn(
      async (_organizationId: string, userIds: string[]) =>
        userIds.map((userId) => ({ userId }))
    ),
    ...overrides,
  } as MeetingRepositoryPort
}

function fakeNotifier(): MeetingNotifier {
  return { notify: vi.fn(async () => undefined) }
}

function createProposal() {
  const start = Date.now() + 72 * HOUR_MS
  return {
    title: "Kickoff",
    durationMinutes: 30,
    mode: "online" as const,
    meetingUrl: "https://meet.example.com/kickoff",
    slots: [
      { startAt: new Date(start).toISOString() },
      { startAt: new Date(start + 24 * HOUR_MS).toISOString() },
    ],
  }
}

describe("MeetingService", () => {
  it("refuses a proposal when client requests are disabled", async () => {
    const repo = fakeRepository({
      getSettings: vi.fn(async () =>
        settingsRow({ clientRequestsEnabled: false })
      ),
    })

    await expect(
      new MeetingService(repo, fakeNotifier()).createRequest(
        portal,
        createProposal()
      )
    ).rejects.toMatchObject({ code: "meeting_requests_disabled" })
    expect(repo.createRequest).not.toHaveBeenCalled()
  })

  it("stores the proposal, flags free slots and notifies staff only", async () => {
    const repo = fakeRepository({
      findSlotConflicts: vi.fn(
        async (_organizationId: string, slots: { startAt: Date }[]) =>
          slots.map((_slot, index) => index === 1)
      ),
    })
    const notifier = fakeNotifier()

    const request = await new MeetingService(repo, notifier).createRequest(
      portal,
      createProposal()
    )

    expect(repo.createRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        clientId: "client_1",
        requestedById: portal.userId,
        requestedByName: portal.userName,
        mode: "online",
        meetingUrl: "https://meet.example.com/kickoff",
      })
    )
    expect(request.slots.map((slot) => slot.hasConflict)).toEqual([false, true])
    expect(notifier.notify).toHaveBeenCalledTimes(1)
    expect(notifier.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        userId: "user_owner",
        actorId: portal.userId,
        type: "meeting.requested",
      })
    )
  })

  it("refuses a proposal whose slots all overlap and auto-decline is on", async () => {
    const repo = fakeRepository({
      findSlotConflicts: vi.fn(
        async (_organizationId: string, slots: { startAt: Date }[]) =>
          slots.map(() => true)
      ),
    })

    await expect(
      new MeetingService(repo, fakeNotifier()).createRequest(
        portal,
        createProposal()
      )
    ).rejects.toMatchObject({ code: "meeting_overlap" })
    expect(repo.createRequest).not.toHaveBeenCalled()
  })

  it("requires notice inside the booking window", async () => {
    const repo = fakeRepository({
      getSettings: vi.fn(async () => settingsRow({ minNoticeHours: 0 })),
    })
    const proposal = createProposal()
    proposal.slots = [
      { startAt: new Date(Date.now() + HOUR_MS).toISOString() },
      { startAt: new Date(Date.now() + 40 * 24 * HOUR_MS).toISOString() },
    ]

    await expect(
      new MeetingService(repo, fakeNotifier()).createRequest(portal, proposal)
    ).rejects.toMatchObject({ code: "meeting_slot_outside_window" })
  })

  it("books the chosen slot on the team calendar when accepting", async () => {
    const pending = requestRow()
    const repo = fakeRepository({
      findRequest: vi.fn(async () => pending),
      findInternalMembers: vi.fn(
        async (_organizationId: string, userIds: string[]) =>
          userIds.map((userId) => ({ userId }))
      ),
      bookRequest: vi.fn(async () =>
        requestRow({
          status: "accepted",
          calendarEventId: "event_1",
          decidedById: ctx.userId,
          decidedByName: ctx.userName,
        })
      ),
    })

    const request = await new MeetingService(
      repo,
      fakeNotifier()
    ).acceptRequest(ctx, {
      id: "request_1",
      slotId: "slot_1",
      attendeeIds: ["user_grace"],
    })

    expect(repo.ensureTeamCalendar).toHaveBeenCalledWith("org_1", ctx.userId)
    expect(repo.bookRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request_1",
        slotId: "slot_1",
        event: expect.objectContaining({
          calendarId: "cal_team",
          createdBy: ctx.userId,
          attendees: [
            { userId: ctx.userId, response: "accepted" },
            { userId: "user_grace", response: "pending" },
          ],
        }),
      })
    )
    expect(request.status).toBe("accepted")
  })

  it("rejects an attendee that is not an internal member", async () => {
    const repo = fakeRepository({
      findRequest: vi.fn(async () => requestRow()),
      findInternalMembers: vi.fn(async () => []),
    })

    await expect(
      new MeetingService(repo, fakeNotifier()).acceptRequest(ctx, {
        id: "request_1",
        slotId: "slot_1",
        attendeeIds: ["user_from_another_org"],
      })
    ).rejects.toMatchObject({ code: "meeting_attendee_invalid" })
    expect(repo.bookRequest).not.toHaveBeenCalled()
  })

  it("declines a pending request with the reviewer's note", async () => {
    const repo = fakeRepository({
      findRequest: vi.fn(async () => requestRow()),
      updateRequest: vi.fn(async (_id, data) =>
        requestRow({
          status: "declined",
          decidedById: ctx.userId,
          decidedByName: ctx.userName,
          decisionNote: data.decisionNote ?? null,
        })
      ),
    })

    const request = await new MeetingService(
      repo,
      fakeNotifier()
    ).declineRequest(ctx, { id: "request_1", note: "Not this month" })

    expect(repo.updateRequest).toHaveBeenCalledWith(
      "request_1",
      expect.objectContaining({
        status: "declined",
        decidedById: ctx.userId,
        decisionNote: "Not this month",
      })
    )
    expect(request.status).toBe("declined")
  })
})
