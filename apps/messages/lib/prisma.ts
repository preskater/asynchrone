/**
 * The messages app's database client.
 *
 * This is the documented transitional binding from
 * `docs/domain-app-template.md`: `@workspace/messaging` still reads the
 * identity `member`/`user` rows (presence and direct-message titles), and
 * attachments still use the files domain's chunked upload sessions and
 * PostgreSQL large objects. The app therefore binds the shared client — the
 * single database package this app imports — instead of pretending to be
 * `asynchrone_messages` and failing on the first member lookup.
 *
 * `@workspace/db-messages` already owns the conversations and the
 * `oidcSession` model; #190/#171 move the identity reads behind the internal
 * APIs and switch this file to that client. Never import two database
 * packages in one app.
 */
import "@/lib/env"

import { prisma } from "@workspace/db"

export { prisma }
