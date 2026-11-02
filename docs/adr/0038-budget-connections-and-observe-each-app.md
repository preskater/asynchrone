# 0038. Budget database connections and give every app its own observability

- Status: accepted
- Date: 2026-11-02
- Deciders: platform
- Issue: #170

## Context

Nine apps (the landing, Copilot, six customer domain apps and the control
tower) each own a `pg.Pool` per replica. With a default `DATABASE_POOL_MAX=3`
and two replicas, the fleet already opens dozens of connections; the chart's
first production values used `10`, which would have opened more than the
PostgreSQL role allows once the HPAs scaled out. One app with a bad value could
take the database down for every other app, which is exactly the failure mode
the per-app split (#192, ADR 0032) is meant to remove.

Separately, every app became its own deployment with its own logs. A 5xx in
`projects` was invisible unless someone read that pod's stdout, there was no
health endpoint on the control tower or the landing, and cross-app navigation
and internal service calls could not be stitched into one trace.

Finally, `revalidatePath`/`revalidateTag` only affect the app that calls them.
Copilot is the workspace shell and the portal, so its mutations can change read
models that the projects/calendars/files/messages/clients/employees hosts
render.

## Decision

1. **One documented fleet budget.** `packages/db-core/src/budget.ts` is the
   single source of truth: an assumed `max_connections` (200), the reserved
   admin/monitoring headroom (10), the 70% planning ratio, and a per-app
   `poolMax`, default replica count and HPA ceiling. The runtime `createPool`
   clamps `DATABASE_POOL_MAX` to the app's ceiling and sets
   `idle_in_transaction_session_timeout` (30 s) and `application_name`.

2. **The chart enforces the budget.** The umbrella chart publishes the same
   numbers under `connectionBudget`, and
   `templates/validate-connections.yaml` fails `helm template`/`helm lint` when
   an app exceeds its ceiling or the fleet at maximum scale exceeds the limit.
   `npm run verify:connection-budget` cross-checks the chart, the budget module
   and the documented topology, so drift fails CI.

3. **PgBouncer stays optional.** The budget fits the target topology without a
   pooler. If the topology grows, the documented next step is a transaction-mode
   PgBouncer in front of the databases, plus per-role `CONNECTION LIMIT` as
   defense in depth — never raising `max_connections` first.

4. **Per-app observability.** Every app (including the stateless landing and the
   control tower) ships:
   - `instrumentation.ts` / `instrumentation-client.ts` for Sentry, disabled
     while `SENTRY_DSN` is empty;
   - `GET /api/health` with its own dependency checks and pool snapshot;
   - `GET /api/metrics` in the Prometheus text format (request counts, 5xx,
     duration histogram, pool saturation, cron outcomes);
   - pod scrape annotations and a fleet `PrometheusRule` with 5xx, pool
     saturation, pool waiting, cron failure/missed and app-unavailable alerts.

5. **One correlation id per logical action.** The proxy adopts `x-request-id`
   or `?rid=`, mints one otherwise, echoes it on the response and stores it in
   a non-HttpOnly, host-only cookie. Client navigation appends it to cross-app
   links; delegated domain calls forward it as `x-request-id`; the domain
   handler echoes it in the response envelope. It is never used for
   authorization.

6. **Explicit cross-app invalidation.** Each customer app exposes
   `POST /internal/v1/invalidate` (`internal:cache:write`, service token) that
   applies `revalidatePath`/`revalidateTag`. Copilot fans out to every domain
   app after an organization-scoped mutation, in `after()`, best-effort and
   logged. Tags are the mechanism for future `use cache`/`unstable_cache`
   reads; today the cross-app reads are `no-store` internal calls, so the
   endpoint is mostly a guard against future caching.

## Consequences

- Adding an app or raising a pool is a two-file change (`budget.ts` and the
  chart values) and fails CI if the numbers disagree or exceed the fleet limit.
- A misconfigured `DATABASE_POOL_MAX` is clamped and logged instead of taking
  down the database role. The DB owner can additionally enforce a role-level
  `CONNECTION LIMIT`.
- Each app is independently observable: its own Sentry project/DSN, its own
  health, its own metrics and alerts. Copilot's telemetry is not a proxy for a
  domain app's health.
- The correlation id is spoofable by a client (it is a log field only). Never
  branch authorization or rate limiting on it.
- Cache invalidation is best-effort: if a domain app is unreachable, its cached
  reads may stay stale until the cache entry expires. Because cross-app reads
  are currently `no-store`, this does not affect today's pages.
- The alert rules assume Prometheus with kube-state-metrics and a scrape config
  that honours `prometheus.io/*` annotations (or a ServiceMonitor that picks up
  the pods). A cluster using the Prometheus Operator may prefer a
  `ServiceMonitor`; the rule expressions stay the same.
