import { CalendarRepository, CalendarService } from "@workspace/calendars"

import { recordUserAudit } from "@/lib/audit"
import { prisma } from "@/lib/prisma"

/**
 * App adapter: the calendar rules live in `@workspace/calendars`; this app binds
 * them to its database client. The package only knows the structural
 * `CalendarDb` port over `asynchrone_calendars` and writes each mutation's audit
 * row through the app's own audit writer.
 */
export const calendarRepository = new CalendarRepository(prisma)
export const calendarService = new CalendarService(
  calendarRepository,
  (ctx, input) => recordUserAudit(ctx, input)
)
