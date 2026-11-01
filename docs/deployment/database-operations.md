# Operating N databases

Eight customer DBs plus the control tower, each owned by one app. This is the
operational contract; the chart and the deployment workflow enforce the parts
they can.

## Secrets

Each app reads only its own connection string:

| App           | Secret key                   |
| ------------- | ---------------------------- |
| Copilot       | `IDENTITY_DATABASE_URL`      |
| Projects      | `PROJECTS_DATABASE_URL`      |
| Calendars     | `CALENDARS_DATABASE_URL`     |
| Files         | `FILES_DATABASE_URL`         |
| Messages      | `MESSAGES_DATABASE_URL`      |
| Clients       | `CLIENTS_DATABASE_URL`       |
| Employees     | `EMPLOYEES_DATABASE_URL`     |
| Control tower | `CONTROL_TOWER_DATABASE_URL` |

Put them in the app's existing Secret; never in `values.yaml`. The migration
Job reads the same keys. Keep `DATABASE_POOL_MAX` in the ConfigMap, not the
Secret (it is not sensitive and must be auditable).

## Network policy

Both subcharts ship `networkPolicy.enabled: false` so an existing cluster keeps
working. Enable it per installation and set:

- `networkPolicy.ingressFrom` to the ingress controller's namespace (the
  default is `ingress-nginx`);
- `networkPolicy.databaseFrom` to the database namespace or `ipBlock`;
- egress 53 (DNS), 5432 (PostgreSQL) and 443 (OAuth/JWKS/providers).

`/internal/v1/*` must never be exposed by the Ingress. The apps also verify
service tokens, but network isolation is the second layer.

## Backups and restore order

Enable continuous archiving / PITR on every database. A logical dump is not
enough for files: file bytes are PostgreSQL large objects, so a restore that
misses `pg_largeobject` restores metadata without content.

Restore **identity first**, then the domain apps, then files last:

1. identity — organizations, members, subscriptions, OAuth clients;
2. projects, calendars, messages, clients, employees;
3. files — metadata and large objects;
4. control tower — platform auth and `PlatformAuditEvent`.

Restoring identity first makes the organization and member ids consistent for
the other databases. Run the restore from a point in time before the incident
for every database, then run `npm run verify:migrations` and the relevant
`verify:*` scripts. Do not start the Copilot app until the migration status is
clear.

## Pool budget

`DATABASE_POOL_MAX` defaults to `3`. Budget the **sum of every app's replicas ×
pool**, plus the migrate Job and any PgBouncer clients. A safe starting point:

| Fleet                  | Replicas | Pool | Connections |
| ---------------------- | -------- | ---- | ----------- |
| Copilot (identity)     | 2        | 10   | 20          |
| 7 domain apps          | 2 each   | 3    | 42          |
| Control tower          | 2        | 3    | 6           |
| Migrate Job / one-offs | 1        | 3    | 3           |
| **Total**              |          |      | **71**      |

Keep the total below 70% of `max_connections`. If it does not fit, put a
PgBouncer in transaction mode in front of the databases and point the apps at
it; never raise `max_connections` first.

## Metrics and alerts

Scrape PostgreSQL and the apps. Minimum alerts:

- `pg_up == 0` per database;
- pool saturation (active / max connections) above 80% for 10 minutes;
- replication/WAL archive failures and backup age above 24 hours;
- `migrate` Job failed or a schema drift (`verify:migrations`) in CI;
- files large-object growth and orphaned `pg_largeobject` OIDs;
- `internal` API 5xx rate and audit fan-out `unavailableApps`.

Use the app `podAnnotations` for Prometheus scrape settings. The health
endpoint is `/api/health`; it checks the database and is used by readiness.

## Failure drill

Quarterly, in a non-production cluster:

1. stop one domain database;
2. confirm Copilot returns partial search/audit results and the failing app is
   named;
3. confirm a deletion/export job is `partial` and does **not** delete identity
   or mark the export ready;
4. restore the database from PITR in the documented order;
5. replay the failed app's saga; it must resume only at that app.
