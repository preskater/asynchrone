import "@/lib/env"

import { pool, prisma } from "@workspace/db-messages"

/**
 * The messages app's own database client.
 *
 * It binds only `asynchrone_messages`; identity and other domains are read through
 * their internal APIs.
 */
export { pool, prisma }
