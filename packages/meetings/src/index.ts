/**
 * Meetings domain: organization settings, client requests, proposed slots and
 * the meeting-app provider abstraction. The package is Next-free; the owning
 * app binds the calendars database client and its notification notifier.
 */
export * from "./types"
export * from "./schemas"
export * from "./providers"
export { MeetingRepository } from "./repository"
export type {
  MeetingRepositoryPort,
  MeetingRequestRow,
  MeetingSettingsRow,
  MeetingSlotRow,
} from "./repository"
export { MeetingService } from "./service"
export type { MeetingNotifier, MeetingPortalContext } from "./service"
