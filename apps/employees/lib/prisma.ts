/**
 * The employees app's database client.
 *
 * `@workspace/employees` still reads identity tables (`member`, `user`) for
 * its member directory and `project` for time allocation, which
 * `asynchrone_employees` does not own yet. Until #171/#190 move those reads
 * behind the identity and projects internal APIs, the app binds the shared
 * client — the single database package this app imports. The per-app
 * `@workspace/db-employees` package already carries the HR tables (plus
 * `oidcSession`); switching `lib/prisma.ts` to it is the last step of that
 * rollout. See `docs/architecture/domain-apps.md`.
 */
import "@/lib/env"

import { prisma } from "@workspace/db"

export { prisma }
