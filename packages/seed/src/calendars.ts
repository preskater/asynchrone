import { prisma } from "@workspace/db-calendars"

import {
  CLIENT_ACME,
  ORG_ID,
  TEAM,
  admin,
  client,
  day,
  designer,
  member,
  owner,
} from "./demo"

const CALENDAR_TEAM = "demo_calendar_team"
const CALENDAR_OWNER = "demo_calendar_owner"
const EVENT_KICKOFF = "demo_event_kickoff"

const events = [
  {
    id: EVENT_KICKOFF,
    calendarId: CALENDAR_TEAM,
    title: "Acme design review",
    startAt: day(1, 14),
    endAt: day(1, 15),
    color: "purple",
  },
  {
    id: "demo_event_standup",
    calendarId: CALENDAR_TEAM,
    title: "Team standup",
    startAt: day(0, 9),
    endAt: day(0, 10),
    color: "blue",
  },
  {
    id: "demo_event_planning",
    calendarId: CALENDAR_TEAM,
    title: "Sprint planning",
    startAt: day(3, 10),
    endAt: day(3, 12),
    color: "green",
  },
  {
    id: "demo_event_focus",
    calendarId: CALENDAR_OWNER,
    title: "Quarterly review prep",
    startAt: day(2, 8),
    endAt: day(2, 10),
    color: "orange",
  },
]

export async function seedCalendars(): Promise<void> {
  await prisma.calendar.createMany({
    data: [
      {
        id: CALENDAR_TEAM,
        organizationId: ORG_ID,
        name: "Team",
        kind: "team",
        color: "blue",
      },
      {
        id: CALENDAR_OWNER,
        organizationId: ORG_ID,
        name: "Camille",
        kind: "personal",
        color: "green",
      },
    ],
    skipDuplicates: true,
  })
  await prisma.calendarMember.createMany({
    data: [
      ...TEAM.map(({ id: userId }) => ({
        id: `${CALENDAR_TEAM}_${userId}`,
        calendarId: CALENDAR_TEAM,
        userId,
      })),
      {
        id: `${CALENDAR_OWNER}_member`,
        calendarId: CALENDAR_OWNER,
        userId: owner.id,
      },
    ],
    skipDuplicates: true,
  })

  // Upsert, not skip: re-running keeps the agenda around today.
  for (const event of events) {
    const data = { ...event, organizationId: ORG_ID, createdBy: owner.id }
    await prisma.calendarEvent.upsert({
      where: { id: event.id },
      create: data,
      update: data,
    })
  }
  await prisma.eventAttendee.createMany({
    data: [
      {
        id: "demo_attendee_1",
        eventId: EVENT_KICKOFF,
        userId: owner.id,
        response: "accepted",
      },
      {
        id: "demo_attendee_2",
        eventId: EVENT_KICKOFF,
        userId: designer.id,
        response: "accepted",
      },
      {
        id: "demo_attendee_3",
        eventId: EVENT_KICKOFF,
        userId: member.id,
        response: "tentative",
      },
    ],
    skipDuplicates: true,
  })

  await prisma.meetingSettings.createMany({
    data: [{ id: "demo_meeting_settings", organizationId: ORG_ID }],
    skipDuplicates: true,
  })
  await prisma.meetingRequest.createMany({
    data: [
      {
        id: "demo_meeting_pending",
        organizationId: ORG_ID,
        clientId: CLIENT_ACME,
        title: "Launch checklist",
        description: "Walk through what is left before going live.",
        requestedById: client.id,
        requestedByName: client.name,
      },
      {
        id: "demo_meeting_accepted",
        organizationId: ORG_ID,
        clientId: CLIENT_ACME,
        title: "Design review",
        status: "accepted",
        requestedById: client.id,
        requestedByName: client.name,
        decidedById: admin.id,
        decidedByName: admin.name,
        decidedAt: day(-2),
        calendarEventId: EVENT_KICKOFF,
      },
    ],
    skipDuplicates: true,
  })

  const slots = [
    {
      id: "demo_slot_1",
      requestId: "demo_meeting_pending",
      startAt: day(5, 10),
      endAt: day(5, 11),
      position: 0,
    },
    {
      id: "demo_slot_2",
      requestId: "demo_meeting_pending",
      startAt: day(6, 15),
      endAt: day(6, 16),
      position: 1,
    },
    {
      id: "demo_slot_3",
      requestId: "demo_meeting_accepted",
      startAt: day(1, 14),
      endAt: day(1, 15),
      position: 0,
      selected: true,
    },
  ]
  for (const slot of slots) {
    await prisma.meetingSlot.upsert({
      where: { id: slot.id },
      create: slot,
      update: slot,
    })
  }
}
