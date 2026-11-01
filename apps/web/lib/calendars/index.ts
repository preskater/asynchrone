import { CalendarRepository, CalendarService } from "@workspace/calendars"

import { prisma } from "@/lib/prisma"

/**
 * App adapter: the calendars rules live in `@workspace/calendars`, the web app
 * binds them to its Prisma client. The package only knows the structural
 * `CalendarDb` port, so the split can later bind `@workspace/db-calendars`
 * without touching the service.
 */
export const calendarRepository = new CalendarRepository(prisma)
export const calendarService = new CalendarService(calendarRepository)
