import "@/lib/env"

import { pool, prisma } from "@workspace/db-calendars"

/**
 * The calendars app's own database client.
 *
 * It binds only `asynchrone_calendars`; identity and other domains are read through
 * their internal APIs.
 */
export { pool, prisma }
