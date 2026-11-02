# Database split runbook

This is the maintenance-window cutover from the monolith database to the
per-app databases ([ADR 0032](../adr/0032-give-each-app-its-own-database.md)).
It is destructive only if run without a snapshot; always take one first.

## Preconditions

- #184 migrations are merged and the target databases exist.
- Every target database is at the `init` migration and is empty.
- The upload sweep has run; open upload sessions are expired or accepted.
- The monolith is the only writer (scale web/domain deployments to zero or put
  them in maintenance mode).
- `pg_dump`, Node, and the repo's dev dependencies are available.

## Dry run

```bash
DATABASE_URL='postgresql://…/asynchrone' \
IDENTITY_DATABASE_URL='postgresql://…/asynchrone_identity' \
PROJECTS_DATABASE_URL='postgresql://…/asynchrone_projects' \
CALENDARS_DATABASE_URL='postgresql://…/asynchrone_calendars' \
FILES_DATABASE_URL='postgresql://…/asynchrone_files' \
MESSAGES_DATABASE_URL='postgresql://…/asynchrone_messages' \
CLIENTS_DATABASE_URL='postgresql://…/asynchrone_clients' \
EMPLOYEES_DATABASE_URL='postgresql://…/asynchrone_employees' \
npm run split:databases -- --dry-run
```

It prints the table and large-object totals per database without writing.

## Snapshot

```bash
pg_dump -Fc -f backups/monolith-$(date +%Y%m%d-%H%M%S).dump "$DATABASE_URL"
```

Keep the dump outside the repository and verify it can be listed with
`pg_restore -l`.

## Copy

```bash
npm run migrate:deploy
npm run split:databases -- --all
```

`--all` copies tables parent-first using `COPY … TO STDOUT` → `COPY … FROM
STDIN`, then large objects, then verifies. It refuses non-empty targets unless
`--truncate` is explicit.

What moves where:

| Data                                                                                                                                 | Target                 |
| ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Users, sessions, organizations, members, OAuth, billing, notifications, assistant, portal, `auditLog` history, `dataExport` archives | `asynchrone_identity`  |
| Projects, tasks, templates, comments, activity, repository connections                                                               | `asynchrone_projects`  |
| Calendars, events, meeting requests/settings                                                                                         | `asynchrone_calendars` |
| File nodes, versions, shares, upload sessions and their bytes                                                                        | `asynchrone_files`     |
| Conversations, messages, reactions, attachment metadata and bytes                                                                    | `asynchrone_messages`  |
| Clients, contacts, pipelines, deals, activities, documents                                                                           | `asynchrone_clients`   |
| Employees profiles, attendance, leave, settings, salary, internal activities                                                         | `asynchrone_employees` |
| Platform auth/audit/handoff                                                                                                          | deferred to #191       |

Notes:

- **Historical audit rows stay in identity.** `AuditLog` has no app column, so
  splitting old rows would be a guess. New rows are written per app; Copilot
  aggregates both.
- **Large objects preserve their OIDs.** The script reads every OID referenced
  by `fileNode`, `uploadSession`, `fileVersion`, `messageAttachment` and
  `dataExport`, creates it in the target with `lo_create(oid)` and streams the
  bytes. Existing `BigInt` OID columns remain valid.
- **Control tower is skipped.** Pass `--include-control-tower` only after #191
  owns its platform data migration.
- **Domain audit tables start empty.** The only historical `auditLog` copy goes
  to identity.

## Verify

`--all` verifies:

- row counts for every table;
- every referenced OID exists and has the same size/SHA-256;
- no target table has a different count from the source.

For a manual spot check:

```bash
psql "$FILES_DATABASE_URL" -c 'SELECT count(*), sum("sizeBytes") FROM "fileNode";'
psql "$FILES_DATABASE_URL" -c 'SELECT count(*) FROM "pg_largeobject_metadata";'
```

## Cutover

1. Deploy the new apps with the per-app `*_DATABASE_URL` values.
2. Run auth, projects, files, messages and portal smoke tests.
3. Unfreeze writes.
4. Keep the monolith database read-only for the rollback window.

## Rollback

1. Scale the new apps down.
2. Redeploy the monolith image with the old `DATABASE_URL`.
3. Point the app back at the old database.
4. Keep the target databases for forensics.

Writes made after cutover are lost on rollback, so keep the window explicit and
short.

## Post-cutover

- Remove the monolith database and its migrations in a later cleanup PR.
- The control tower is already cut over to `asynchrone_control_tower`
  (see [control-tower-database.md](./control-tower-database.md)); Copilot reads
  `@workspace/db-identity` and every domain app reads its own package (#171).
  The internal APIs, audit fan-out and export/deletion sagas are live.
- Do not delete the snapshot until the rollback window closes.
