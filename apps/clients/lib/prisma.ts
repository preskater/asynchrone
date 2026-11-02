import "@/lib/env"

import { pool, prisma } from "@workspace/db-clients"

/**
 * The clients app's own database client.
 *
 * It binds only `asynchrone_clients`; identity and other domains are read through
 * their internal APIs.
 */
export { pool, prisma }
