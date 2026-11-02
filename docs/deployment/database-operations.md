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

The generic app chart ships `<app>.networkPolicy.enabled: false` (the umbrella
instantiates it per app), so an existing cluster keeps working. Enable it per
installation and set:

- `<app>.networkPolicy.ingressFrom` to the ingress controller's namespace (the
  default is `ingress-nginx`);
- `<app>.networkPolicy.databaseFrom` to the database namespace or `ipBlock`
  (the landing sets `database: false` because it has no database);
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

`DATABASE_POOL_MAX` is the per-pod pool. `@workspace/db-core` clamps it to the
app ceiling in `packages/db-core/src/budget.ts` (ADR 0038), so a copied value
can never make one app exhaust the shared role. Budget the **sum of every app's
replicas at its HPA ceiling × pool**, plus the migrate Job and any PgBouncer
clients.

Assumed server configuration: `max_connections=200`, 10 reserved for
superuser/monitoring/ad-hoc sessions, and a 70% planning ratio, which leaves
**133 usable connections**.

| App           | Replicas (max) | Pool | Connections |
| ------------- | -------------- | ---- | ----------- |
| Copilot       | 4              | 8    | 32          |
| projects      | 3              | 4    | 12          |
| calendars     | 3              | 4    | 12          |
| files         | 3              | 6    | 18          |
| messages      | 3              | 4    | 12          |
| clients       | 3              | 4    | 12          |
| employees     | 3              | 4    | 12          |
| control tower | 2              | 3    | 6           |
| migrate Job   | 1              | 5    | 5           |
| **Total**     |                |      | **121**     |

A default install (two replicas each, no HPA) opens 79. The umbrella chart's
`templates/validate-connections.yaml` fails the release when an app exceeds its
ceiling or the fleet exceeds 133; `npm run verify:connection-budget` fails CI
when the chart, the budget module and this table disagree.

If the topology does not fit, put a **PgBouncer in transaction mode** in front
of the databases and point the apps at it. Never raise `max_connections` first.
Defense in depth: give each app its own PostgreSQL role with a connection limit
matching its allocation (plus one for the migration role):

```sql
ALTER ROLE app_copilot CONNECTION LIMIT 32;
ALTER ROLE app_projects CONNECTION LIMIT 12;
ALTER ROLE app_files CONNECTION LIMIT 18;
-- … one per app, matching the table above
```

`createPool` sets `idle_in_transaction_session_timeout=30s`, a 5-minute
`statement_timeout` and `application_name=<app>`, so a stuck transaction
releases its connection instead of holding the budget all night.

## Metrics and alerts

Every app exposes:

- `GET /api/health` — its own dependency checks plus the pool snapshot; used by
  the readiness probe. A domain app's failure never fails Copilot's probe.
- `GET /api/metrics` — Prometheus text format: `asynchrone_http_requests_total`,
  `asynchrone_http_errors_total`, `asynchrone_http_request_duration_seconds`,
  `asynchrone_db_pool_connections{state}`, `asynchrone_db_pool_saturation` and
  `asynchrone_cron_runs_total{outcome}`.

The app chart annotates every pod with `prometheus.io/scrape`, and the umbrella
chart renders one `PrometheusRule` (`monitoring.enabled`, on by default) with:

- `AsynchroneHighErrorRate` — more than 2% 5xx for 10 minutes, per app;
- `AsynchroneDatabasePoolSaturation` — pool above 80% for 10 minutes;
- `AsynchroneDatabasePoolWaiting` — requests queued for a connection;
- `AsynchroneCronJobFailed` / `AsynchroneCronJobMissedHourly` /
  `AsynchroneCronJobMissedDaily` — kube-state-metrics Job and CronJob state;
- `AsynchroneAppUnavailable` — a deployment with zero available replicas.

Also scrape PostgreSQL and alert on `pg_up == 0` per database, replication/WAL
archive failures, backup age above 24 hours, a failed `migrate` Job, files
large-object growth and orphaned OIDs, and the audit fan-out
`unavailableApps`.

## Failure drill

Quarterly, in a non-production cluster:

1. stop one domain database;
2. confirm Copilot returns partial search/audit results and the failing app is
   named;
3. confirm a deletion/export job is `partial` and does **not** delete identity
   or mark the export ready;
4. restore the database from PITR in the documented order;
5. replay the failed app's saga; it must resume only at that app.
