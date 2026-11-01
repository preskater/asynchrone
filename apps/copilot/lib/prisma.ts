// Validates the Copilot app's runtime configuration on first import (fail fast).
import "./env"

/**
 * Compatibility shim.
 *
 * The Prisma schema, migrations, shared `pg.Pool` and generated client live in
 * `packages/db` (`@workspace/db`) so the customer app and the control tower use
 * one schema. Existing import sites keep using `@/lib/prisma`; this file only
 * re-exports the shared singleton.
 */
export { pool, prisma } from "@workspace/db"
