import "@/lib/env"

import { pool, prisma } from "@workspace/db-projects"

/**
 * The projects app's own database client.
 *
 * It binds only `asynchrone_projects`; identity and other domains are read through
 * their internal APIs.
 */
export { pool, prisma }
