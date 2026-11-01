/**
 * The calendars app's database client.
 *
 * `@workspace/calendars` binds the narrow `CalendarDb` port and
 * `@workspace/meetings` the `MeetingDb` port; both are satisfied by the
 * generated client. Today the app still needs identity reads (`user`, `member`,
 * `session`, `organization`, `notification`) for the workspace gate, the
 * organization shell and the meeting notifier, and the task overlay still reads
 * `task` through `@workspace/projects`.
 *
 * Until #190/#171 move those reads behind the identity internal API, the app
 * binds the shared client — the single database package it imports — exactly
 * like the projects pilot instead of importing two clients. The generated
 * `@workspace/db-calendars` schema already carries `calendarEvent`,
 * `meetingRequest`, `oidcSession` and `auditLog`, so the cutover only swaps the
 * binding. See `docs/architecture/domain-apps.md`.
 */
import "@/lib/env"

import { pool, prisma } from "@workspace/db"

export { pool, prisma }
