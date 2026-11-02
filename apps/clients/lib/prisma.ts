/**
 * The clients app's database client.
 *
 * `@workspace/clients` still reads identity tables (`member`, `user`,
 * `fileNode`, `project`) for its member directory, document links and project
 * links, which `asynchrone_clients` does not own yet. Until #171/#190 move
 * those reads behind the identity and domain internal APIs, the app binds the
 * shared client — the single database package this app imports. The per-app
 * `@workspace/db-clients` package already carries the CRM tables (plus
 * `oidcSession`); switching `lib/prisma.ts` to it is the last step of that
 * rollout. See `docs/architecture/domain-apps.md`.
 */
import "@/lib/env"

import { pool, prisma } from "@workspace/db"

export { pool, prisma }
