/**
 * Calendars domain: calendars, members, events, attendees and date helpers.
 * The package is Next-free; the owning app binds its database client and the
 * portal/Copilot call the service through the app adapter or internal API.
 */
export * from "./types"
export * from "./schemas"
export * from "./date-utils"
export type { CalendarDb } from "./db"
export { CalendarRepository } from "./repository"
export type {
  CalendarEventRow,
  CalendarRepositoryPort,
  CalendarRow,
} from "./repository"
export { CalendarService } from "./service"
