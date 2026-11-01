import { describe, expect, it, vi } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type {
  CalendarEventRow,
  CalendarRepositoryPort,
  CalendarRow,
} from "./repository"
import { CalendarService } from "./service"

const ctx: RequestContext = {
  userId: "user_ada",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  role: "member",
}

function calendarRow(
  overrides: Partial<CalendarRow> & Pick<CalendarRow, "id" | "name">
): CalendarRow {
  return {
    organizationId: "org_1",
    color: "blue",
    kind: "personal",
    visible: true,
    createdAt: new Date("2026-11-01T09:00:00Z"),
    members: [{ id: "member_1", calendarId: overrides.id, userId: ctx.userId }],
    ...overrides,
  }
}

function eventRow(overrides: Partial<CalendarEventRow> = {}): CalendarEventRow {
  return {
    id: "event_1",
    organizationId: "org_1",
    calendarId: "cal_1",
    title: "Weekly review",
    description: null,
    startAt: new Date("2026-11-02T09:00:00Z"),
    endAt: new Date("2026-11-02T10:00:00Z"),
    allDay: false,
    location: null,
    meetingUrl: null,
    meetingPassword: null,
    color: "blue",
    reminderMinutes: null,
    createdBy: ctx.userId,
    createdAt: new Date("2026-11-01T09:00:00Z"),
    updatedAt: new Date("2026-11-01T09:00:00Z"),
    attendees: [
      {
        id: "attendee_1",
        eventId: "event_1",
        userId: ctx.userId,
        response: "accepted",
      },
    ],
    ...overrides,
  } as CalendarEventRow
}

function fakeRepository(
  overrides: Partial<CalendarRepositoryPort> = {}
): CalendarRepositoryPort {
  return {
    listCalendars: vi.fn(async () => []),
    findCalendar: vi.fn(async () => null),
    createCalendar: vi.fn(async () =>
      calendarRow({ id: "cal_new", name: "New" })
    ),
    setCalendarVisible: vi.fn(async () =>
      calendarRow({ id: "cal_1", name: "Team" })
    ),
    listEvents: vi.fn(async () => []),
    findEvent: vi.fn(async () => null),
    createEvent: vi.fn(async () => eventRow()),
    updateEvent: vi.fn(async () => eventRow()),
    deleteEvent: vi.fn(async () => ({ id: "event_1" })),
    setAttendeeResponse: vi.fn(async () => ({ id: "attendee_1" })),
    ...overrides,
  } as CalendarRepositoryPort
}

describe("CalendarService", () => {
  it("creates the personal calendar with the caller as its only member", async () => {
    const personal = calendarRow({ id: "cal_personal", name: "Personal" })
    let calendars: CalendarRow[] = []
    const repo = fakeRepository({
      listCalendars: vi.fn(async () => calendars),
      createCalendar: vi.fn(async (input) => {
        expect(input).toMatchObject({
          organizationId: "org_1",
          name: "Personal",
          kind: "personal",
          color: "blue",
          memberIds: ["user_ada"],
        })
        calendars = [personal]
        return personal
      }),
    })

    const shell = await new CalendarService(repo).listShell(ctx)

    expect(repo.createCalendar).toHaveBeenCalledTimes(1)
    expect(shell.events).toEqual([])
    expect(shell.calendars).toEqual([
      {
        id: "cal_personal",
        name: "Personal",
        color: "blue",
        kind: "personal",
        visible: true,
        memberIds: ["user_ada"],
      },
    ])
  })

  it("maps every member of an existing calendar", async () => {
    const repo = fakeRepository({
      listCalendars: vi.fn(async () => [
        calendarRow({
          id: "cal_team",
          name: "Team",
          kind: "team",
          members: [
            { id: "m1", calendarId: "cal_team", userId: "user_ada" },
            { id: "m2", calendarId: "cal_team", userId: "user_grace" },
          ],
        }),
      ]),
    })

    const shell = await new CalendarService(repo).listShell(ctx)

    expect(shell.calendars[0]?.memberIds).toEqual(["user_ada", "user_grace"])
    expect(repo.createCalendar).not.toHaveBeenCalled()
  })

  it("answers as the caller, never on behalf of another member", async () => {
    const repo = fakeRepository({
      findEvent: vi.fn(async () => eventRow()),
    })

    await new CalendarService(repo).setAttendeeResponse(ctx, "event_1", {
      response: "declined",
    })

    expect(repo.setAttendeeResponse).toHaveBeenCalledWith(
      "event_1",
      "user_ada",
      "declined"
    )
  })

  it("refuses event writes for a viewer", async () => {
    const repo = fakeRepository({
      findCalendar: vi.fn(async () =>
        calendarRow({ id: "cal_1", name: "Team" })
      ),
    })
    const service = new CalendarService(repo)

    await expect(
      service.createEvent(
        { ...ctx, role: "viewer" },
        {
          calendarId: "cal_1",
          title: "Review",
          startAt: "2026-11-02T09:00:00Z",
          endAt: "2026-11-02T10:00:00Z",
          color: "blue",
        }
      )
    ).rejects.toMatchObject({ code: "role_cannot_modify_calendars" })
    expect(repo.createEvent).not.toHaveBeenCalled()
  })

  it("rejects an event for a calendar from another organization", async () => {
    const repo = fakeRepository({ findCalendar: vi.fn(async () => null) })
    const service = new CalendarService(repo)

    await expect(
      service.createEvent(ctx, {
        calendarId: "cal_other",
        title: "Review",
        startAt: "2026-11-02T09:00:00Z",
        endAt: "2026-11-02T10:00:00Z",
        color: "blue",
      })
    ).rejects.toMatchObject({ status: 404 })
    expect(repo.createEvent).not.toHaveBeenCalled()
  })
})
