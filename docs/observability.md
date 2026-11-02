# Observability

Every app in the fleet is its own failure domain and reports independently
(ADR 0038, issue #170). Copilot's telemetry is not a proxy for a domain app's
health: the landing, Copilot, the six domain apps and the control tower each
have their own Sentry DSN, health endpoint, metrics endpoint and logs.

## Sentry

Each app ships `instrumentation.ts` (server and edge) and
`instrumentation-client.ts` (browser):

- `SENTRY_DSN` enables server-side error tracking and 10% trace sampling. The
  DSN is read at runtime from the app's Secret.
- `createNextConfig` inlines the same value as `NEXT_PUBLIC_SENTRY_DSN` at
  build time, so the Docker build needs `SENTRY_DSN` as a build arg
  (`.github/workflows/docker.yml` passes the repository variable).
- Events use `DEPLOY_ENV` (falling back to `NODE_ENV`) as the environment and
  `GIT_COMMIT_SHA` as the release. The app chart injects both.
- Nothing is sent while the DSN is empty, so local development and CI need no
  account.

Use a separate Sentry project (or at least a separate tag) per app, so a
domain app's errors are not buried under Copilot's.

## Health

`GET /api/health` is the readiness probe (liveness uses `/`). The payload is:

```json
{
  "ok": true,
  "app": "projects",
  "version": "sha-abc1234",
  "uptimeSeconds": 312,
  "correlationId": "…",
  "checks": { "database": { "ok": true } },
  "pool": { "total": 2, "idle": 1, "waiting": 0, "max": 4 }
}
```

A failed check answers `503` with the failing dependency named. The landing and
the control tower get their own endpoint too: the landing has no dependency,
the control tower checks only `asynchrone_control_tower`.

## Metrics

`GET /api/metrics` uses the Prometheus text format and is scoped to the
process, i.e. each replica is scraped:

| Metric                                     | Type      | Use                                 |
| ------------------------------------------ | --------- | ----------------------------------- |
| `asynchrone_http_requests_total`           | counter   | request rate, 5xx ratio             |
| `asynchrone_http_errors_total`             | counter   | 5xx by route                        |
| `asynchrone_http_request_duration_seconds` | histogram | p50/p95/p99 latency                 |
| `asynchrone_db_pool_connections`           | gauge     | `state={total,idle,waiting,max}`    |
| `asynchrone_db_pool_saturation`            | gauge     | in-use / `DATABASE_POOL_MAX` (0–1)  |
| `asynchrone_cron_runs_total`               | counter   | `outcome={success,failure}` per job |

The series carry only `app`, `route`, `method`, `status`, `state`, `job` and
`outcome` labels — never a tenant, user or query string. The endpoint is
unauthenticated inside the cluster on purpose.

The app chart adds `prometheus.io/scrape=true`, `prometheus.io/port` and
`prometheus.io/path` to every pod template. The umbrella chart renders the
alert rules (`monitoring.enabled`); the expressions are in
`charts/asynchrone-space/templates/prometheusrule.yaml` and documented in
[Database operations](./deployment/database-operations.md#metrics-and-alerts).

## Request timing and logs

Route handlers wrapped with `withObservedRoute` (health, metrics, cron, the
delegated domain API) and the cron wrapper emit one JSON line per request:

```json
{
  "level": "info",
  "message": "http.request",
  "time": "…",
  "app": "projects",
  "route": "/api/health",
  "method": "GET",
  "status": 200,
  "durationMs": 3.21,
  "correlationId": "…"
}
```

Use `logJson`/`logRequest` from `@workspace/observability` for new routes. Never
log an authorization header, a cookie, a token or a request body.

## Correlation ids

One logical action keeps one id across apps:

1. **Mint or adopt.** Each app's proxy (landing, Copilot and the six domain
   apps) reads `x-request-id`, then `?rid=`, then the `asynchrone_rid` cookie,
   and mints a UUID otherwise. It echoes the id on the response and stores it in
   a host-only, non-HttpOnly cookie (30 minutes).
2. **Cross-app navigation.** A link to another host appends `rid=<id>`
   (`correlateUrl` in the app shell); the target proxy adopts it. The cookie
   cannot cross a subdomain boundary, which is why the id travels in the URL
   (ADR 0018 keeps auth cookies host-only; this cookie is not auth).
3. **Internal calls.** Copilot's delegated domain client sends `x-request-id`
   from the inbound request; the domain handler echoes it in the response
   envelope (`meta.requestId`) and its log line.

The control tower has no proxy; it links to Copilot through the one-time
impersonation handoff, which is its own flow.

The id is a log field only. Never authorize, rate-limit or cache on it — a
client can choose it.

## Cross-app caching and invalidation

`revalidatePath`/`revalidateTag` only affect the deployment that calls them.

**Today:** every cross-app read is an internal API call with
`cache: "no-store"`, and the workspace pages read the session and the database
per request. There is no `use cache`/`unstable_cache` in the apps, so a
mutation cannot leave a stale cross-app page behind.

**Guard for later:** each customer app exposes
`POST /internal/v1/invalidate` with the `internal:cache:write` scope. The
payload is `{ organizationId, organizationSlug, paths[], tags[], reason? }`;
paths must be absolute and free of `..`, `//`, `?` or `#`. The target app runs
`revalidatePath(path, "layout")` and `revalidateTag(tag, { expire: 0 })`.
Copilot's `revalidateOrgPath` fans out to every configured domain app after an
organization-scoped mutation, inside `after()` so the response is not delayed;
failures are logged (`cache.invalidation_failed`) and never fail the mutation.

When you add a `use cache` read to a domain app, register a tag and include it
in the fan-out (`tags: [...]`) — otherwise only that app's own mutations will
clear it.
