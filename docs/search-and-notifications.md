# Search, notifications and recents

These read/write paths cross app boundaries but cannot share a database.

## Notifications

Copilot owns the notification table. Domain apps send:

```text
POST /internal/v1/notifications
scope: internal:notifications:write
```

with `{ organizationId, userId, type, title, body?, url?, idempotencyKey }`.
The receiver verifies the recipient is a member, stores the display fields in
`notification.data`, and deduplicates on
`(organizationId, idempotencyKey)`. A retry returns `{ created: false }` instead
of a duplicate. Domain apps retry with the same key (contract:
`NotificationClient`); a failed delivery is retried by the sender, not by a
queue in Copilot.

## Search

Every domain app exposes:

```text
GET /internal/v1/search?organizationId=…&q=…&limit=…
scope: internal:search:read
```

using `createSearchHandler` from `@workspace/search`. The app searches only its
own database and applies its own role, visibility, portal and organization
rules. `SearchClient` is the typed caller.

Copilot fans out with `searchAcrossApps` (`apps/copilot/lib/search/fanout.ts`):

- per-app timeout (2 s by default);
- merge and deduplicate by app/type/id;
- a slow or down app yields `partial: true` and `unavailableApps`, while the
  remaining results render;
- no service ever queries another app's database.

Only apps with an origin configured participate (`PROJECTS_APP_URL`,
`CALENDARS_APP_URL`, `FILES_APP_URL`, `MESSAGES_APP_URL`, `CLIENTS_APP_URL`,
`EMPLOYEES_APP_URL`), using Copilot's OAuth client credentials.

## Recents

Recents stay **per app**: each app stores and serves its own recent items,
because the rows are domain data and the ordering depends on that app's
visibility rules. Copilot composes the shelf from the per-app results using the
same fan-out (it does not persist a second copy, which would leak deleted
records). A future cross-app "recently viewed" service would be a separate,
explicitly-scoped Copilot table; it is not part of this milestone.

## Failure modes

- Notification idempotency: a duplicate delivery is a no-op.
- Search: one app can fail without failing the request.
- Contracts and failure modes are covered by
  `packages/search`, `packages/contracts` and
  `apps/copilot/lib/search/fanout.unit.test.ts`.
