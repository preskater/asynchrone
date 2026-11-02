import "@/lib/env"

import { pool, prisma } from "@workspace/db-files"

/**
 * The files app's own database client.
 *
 * It binds only `asynchrone_files`; identity and other domains are read through
 * their internal APIs.
 */
export { pool, prisma }
