/**
 * The files app's database client.
 *
 * `@workspace/files` binds the narrow `FileDb`-style ports through its runtime;
 * today the app also needs identity reads (`user`, `member`, `session`,
 * `organization`, `rateLimit`, `notification`, `messageAttachment`) for the
 * workspace gate, the plan/quota checks, the shared rate limiter and the
 * large-object reference check.
 *
 * Until #190/#171 move those reads behind the identity internal API, the app
 * binds the shared client — the single database package it imports — exactly
 * like the projects pilot instead of importing two clients. The generated
 * `@workspace/db-files` schema already carries `fileNode`, `uploadSession`,
 * `oidcSession` and `auditLog`, so the cutover only swaps the binding. See
 * `docs/architecture/domain-apps.md`.
 */
import "@/lib/env"

import { pool, prisma } from "@workspace/db"

export { pool, prisma }
