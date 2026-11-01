/** Shared types and constants for client meeting requests. */

export const MEETING_MODES = ["online", "in_person"] as const
export type MeetingMode = (typeof MEETING_MODES)[number]

export const MEETING_STATUSES = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
] as const
export type MeetingStatus = (typeof MEETING_STATUSES)[number]

/**
 * Meeting apps a request can be handed to on acceptance. `manual` uses the
 * details provided by the client; the other ids are reserved for connected
 * apps (see `lib/meetings/providers.ts`).
 */
export const MEETING_PROVIDERS = [
  "manual",
  "google_meet",
  "microsoft_teams",
  "zoom",
] as const
export type MeetingProviderId = (typeof MEETING_PROVIDERS)[number]

/** Durations offered in the portal form (minutes). */
export const MEETING_DURATIONS = [15, 30, 45, 60, 90, 120] as const

export const MIN_MEETING_MINUTES = 15

/** A proposal must offer at least two times and at most five. */
export const MIN_PROPOSED_SLOTS = 2
export const MAX_PROPOSED_SLOTS = 5

/** Organization rules for client meeting requests. */
export interface MeetingSettingsData {
  clientRequestsEnabled: boolean
  autoDeclineOverlaps: boolean
  bookingWindowDays: number
  minNoticeHours: number
  defaultDurationMinutes: number
  maxDurationMinutes: number
  provider: MeetingProviderId
}

/** Defaults used when an organization has no settings row yet. */
export const DEFAULT_MEETING_SETTINGS: MeetingSettingsData = {
  clientRequestsEnabled: true,
  autoDeclineOverlaps: true,
  bookingWindowDays: 30,
  minNoticeHours: 24,
  defaultDurationMinutes: 30,
  maxDurationMinutes: 120,
  provider: "manual",
}

/** Settings a portal user needs to fill the request form. */
export interface PortalMeetingSettings {
  clientRequestsEnabled: boolean
  bookingWindowDays: number
  minNoticeHours: number
  defaultDurationMinutes: number
  maxDurationMinutes: number
  /**
   * True while no meeting app is connected: the client must provide the join
   * link themselves. A connected app generates it on acceptance.
   */
  requiresMeetingUrl: boolean
}

/** One time proposed by the client. */
export interface MeetingSlotData {
  id: string
  startAt: string
  endAt: string
  /** True when this slot overlaps another meeting during the proposal. */
  hasConflict: boolean
  /** True when the team picked this slot on acceptance. */
  selected: boolean
}

/** One meeting request as shown in the portal and in the team inbox. */
export interface MeetingRequestData {
  id: string
  clientId: string
  clientName: string
  title: string
  description?: string
  /** Candidate times proposed by the client. */
  slots: MeetingSlotData[]
  mode: MeetingMode
  meetingUrl?: string
  meetingPassword?: string
  address?: string
  status: MeetingStatus
  requestedByName: string
  decidedByName?: string
  decidedAt?: string
  decisionNote?: string
  calendarEventId?: string
  provider: MeetingProviderId
  createdAt: string
}

/** Data of the portal meetings page. */
export interface PortalMeetingsData {
  settings: PortalMeetingSettings
  requests: MeetingRequestData[]
}

/** Data of the team meeting-request inbox. */
export interface MeetingRequestsData {
  settings: MeetingSettingsData
  requests: MeetingRequestData[]
}
