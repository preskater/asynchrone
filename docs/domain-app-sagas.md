# Cross-database export and deletion

There is no transaction across app databases. Export and deletion are therefore
explicit sagas: durable state in the identity database, one idempotent call per
app, and identity last. The rules live in `@workspace/sagas`
(`packages/sagas`); the identity persistence adapter is
`apps/copilot/lib/sagas/store.ts`.

## Tables

| Table                     | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `organizationDeletionJob` | One row per organization; status + deadline  |
| `organizationDeletionApp` | Per-app status, attempts and last error      |
| `userDeletionJob`         | One row per account deletion                 |
| `userDeletionApp`         | Per-app status for account deletion          |
| `dataExportApp`           | One part per app for a cross-database export |

The tables are generated into the identity schema by `npm run split:prisma` and
are not present in domain databases.

## Deletion

`runOrganizationDeletionSaga` and `runUserDeletionSaga`:

1. ensure the job and one app row per configured domain app;
2. skip apps already `completed` or `skipped` (a retry resumes at the failure);
3. mark each app `running`, call its idempotent
   `DELETE /internal/v1/organizations/:id` or `/users/:id`, then persist
   `completed` or `failed`;
4. delete identity **only** when every app completed;
5. otherwise mark the job `partial` with the failing apps.

A deadline stops a stuck job; it never deletes identity. The caller retries the
same job id. `deleteOrganizationAcrossApps` in `apps/copilot/lib/sagas/service.ts`
wraps the orchestrator and keeps the legacy single-database path when no domain
origin is configured.

Domain apps implement the target side with
`createOrganizationDeletionHandler`, `createUserDeletionHandler` and
`createOrganizationExportHandler` from `@workspace/sagas`, gated by
`internal:delete:write` / `internal:export:read`. A deletion handler must be
idempotent and must unlink large objects in the files database before reporting
success.

## Export

Each app exposes `GET /internal/v1/organizations/:id/export`, returning
`{ manifest, data }` (`ExportPartSchema`). Copilot writes each part into the
archive and records `dataExportApp`. `canMarkExportReady` returns true only when
every expected part is `complete`; a missing or failed part keeps the export
`processing`/`failed` and never `ready`.

## Status and operations

`SagaClient` in `@workspace/contracts` is the typed caller. The identity adapter
stores attempts and errors so the progress UI and alerts can report the failing
app. `docs/deployment/helm.md` documents the CronJob wiring; domain app
endpoints and the archive streaming path land in milestone #1 with the apps.
