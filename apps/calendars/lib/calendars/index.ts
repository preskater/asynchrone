import { CalendarRepository, CalendarService } from "@workspace/calendars"

import { prisma } from "@/lib/prisma"

/**
 * App adapter: the calendar rules live in `@workspace/calendars`; this app binds
 * them to its database client. The package only knows the structural
 * `CalendarDb` port, so the app can bind `@workspace/db-calendars` as soon as
 * the identity reads move behind the internal API (#190) without touching the
 * service.
 */
export const calendarRepository = new CalendarRepository(prisma)
export const calendarService = new CalendarService(calendarRepository)
