/**
 * The projects app's database client.
 *
 * Until #190 moves the projects domain behind the identity internal API, the
 * `@workspace/projects` domain still reads `member`/`user`/`account` rows
 * (`packages/projects/src/db.ts`). The pilot therefore binds the shared client
 * — the single database package this app imports — instead of pretending to be
 * `asynchrone_projects` and failing on the first member lookup. See
 * `docs/architecture/domain-apps.md` for the transitional binding and the
 * rollout that replaces it.
 */
import "@/lib/env"

import { pool, prisma } from "@workspace/db"

export { pool, prisma }
