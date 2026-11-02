import "@/lib/env"

import { pool, prisma } from "@workspace/db-employees"

/**
 * The employees app's own database client.
 *
 * It binds only `asynchrone_employees`; identity and other domains are read through
 * their internal APIs.
 */
export { pool, prisma }
