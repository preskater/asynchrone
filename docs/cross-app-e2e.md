# Cross-app end-to-end suite

`packages/e2e` (`@workspace/e2e`) is the browser suite that spans apps: one
Copilot session, two relying parties on separate hosts, the control-tower
impersonation handoff and the failure-injection cases from #210.

Per-app suites (`apps/<app>/e2e`) test one app against Copilot. This suite owns
what only exists when several hosts are live at once: host-only cookies side by
side, back-channel logout fan-out, organization switching across apps,
audience-bound service tokens, and a peer that is down.

```bash
# from the repository root, with the per-app databases migrated
npm run test:e2e --workspace=@workspace/e2e
```

The script provisions the OAuth clients (see below), starts Copilot, projects
and calendars, and runs Playwright. `E2E_CROSS_APP_EXTERNAL=1` skips the
`webServer` array when the three apps are already running.

## Ports and hosts

| App       | Origin                       | Why                                                        |
| --------- | ---------------------------- | ---------------------------------------------------------- |
| Copilot   | `http://localhost:3020`      | dedicated ports keep the suite clear of every other e2e job |
| projects  | `http://localhost:3021`      | shares `localhost` with Copilot (different cookie name)     |
| calendars | `http://127.0.0.1:3022`      | a different host, so the host-only session cookie is separate |
| (none)    | `http://127.0.0.1:3099`      | "configured but unreachable" app for failure injection      |

Cookies ignore ports: two domain apps on `localhost` would overwrite each
other's `asynchrone_session`. Production separates them by host
(`projects.copilot.asynchrone.space` vs `calendars.copilot.asynchrone.space`),
so the suite does the same and keeps both sessions genuinely host-only.

## OAuth clients

No client is restated in this package. `e2e/bootstrap.ts` spawns the apps' own
bootstraps with this suite's origins:

- `apps/copilot/e2e/bootstrap.ts` — Copilot's client-credentials client;
- `apps/projects/e2e/bootstrap.ts`, `apps/calendars/e2e/bootstrap.ts` — the two
  relying-party clients (`E2E_*_URL` makes them register this suite's redirect
  URIs).

`apps/copilot/scripts/provision-cross-app-clients.ts` then closes the three gaps
the per-app scripts leave, using `buildOAuthClientManifest()` and
`appOAuthResources()` as the source of truth:

1. resource rows carry the union of user-delegated and service scopes (each
   per-app bootstrap writes only its own half and the last one would win);
2. Copilot's service client reaches the calendars audience;
3. the control-tower service client exists — the only caller allowed to create
   a platform handoff (`internal:identity:admin`).

## What it covers

| Spec                 | Contract                                                                                                                                                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oidc.spec.ts`       | Copilot sign-in → projects authorization; host-only session cookie; refresh-token grant when the stored token is near expiry; organization switch ends the session bound to the previous organization and revokes the other apps by `sid`; Copilot sign-out dispatches back-channel logout and both apps sign out. |
| `audience.spec.ts`   | A projects-audience token is accepted by projects and rejected (`invalid_token`) by calendars, and vice versa; the admin API requires the control-tower client's `internal:identity:admin` (a read-only control-tower token gets `insufficient_scope`, a domain token gets `invalid_token`); a domain scope cannot be minted for the control-tower client; a stale (expired, unrefreshable) app session is deleted and never reused. |
| `impersonation.spec.ts` | The control tower's handoff call → single-use grant → `/api/platform/handoff` → Copilot session with `impersonatedBy`, one-hour cookie and banner on Copilot and on projects; a replay is refused; the workspace gate ends an impersonation older than an hour on Copilot and on the domain app; "Stop impersonating" deletes the Copilot session, fans out the revoke and returns to the control-tower origin. |
| `failure.spec.ts`    | A configured-but-unreachable app degrades global search to `partial` with the live domains' results; the delegated domain gateway returns a typed, retryable `DomainClientError` (`domain_unavailable`, 503); the switch fan-out resolves with a peer down; the audit fan-out returns local rows plus `partial` and a partial export; the deletion saga retries at the failed app and deletes identity only when every app completed. |

### Failure injection

The fan-out, the delegated gateway and the deletion saga are Copilot modules,
and a workspace package may not import an app. `failure.spec.ts` therefore
spawns `apps/copilot/scripts/e2e-cross-app-probe.ts` with the domain origins the
case needs (`appUrls`) and reads one `__PROBE__<json>` line. Everything runs the
production code against the running apps and the real identity database. The
only stub is the app that "recovers" in the deletion-retry case: the probe
points that app at a local server so it can simulate an outage and recovery,
so the probe starts a
local HTTP server that speaks the documented
`DELETE /internal/v1/organizations/:id` contract and fails once before
succeeding. The real apps mount every other endpoint the probe uses
(`/internal/v1/search`, `/internal/v1/audit*`,
`/internal/v1/organizations/:id/export`).

## Databases

The suite needs the monolith migrations plus the per-app migrations
(`npm run db:create && npm run migrate:deploy && npm run verify:migrations`).
Each app owns its `oidcSession` table: `playwright.config.ts` passes
`IDENTITY_DATABASE_URL`, `PROJECTS_DATABASE_URL` and `CALENDARS_DATABASE_URL`
to the three servers, and `e2e/db.ts` opens one connection per database.
`oidcSessionsForUser()` merges the projects and calendars rows; mutating
helpers find the owning database by session id. Copilot's Better Auth session
lives only in the identity database.

## Notes

- Local runs use `next dev`. A production `next build` writes `.next`, and a dev
  server started on that directory recompiles very slowly; remove the three
  apps' `.next` before a local run (or run with `CI=1` against the built apps).
- Copilot rotates refresh tokens, so two concurrent requests for one app
  session (the router's prefetch plus the navigation, or two tabs) can race the
  same rotation. `resolveSession` keeps the winner's token instead of signing
  the user out and tolerates a concurrent delete; the refresh spec uses one
  document request so it pins the grant itself rather than the race.

## Gaps

- The control-tower **UI** action is not driven; the impersonation spec calls
  the same `IdentityAdminClient.createHandoff` endpoint the action calls, then
  drives the entire browser flow. The TOTP-gated console itself is covered by
  `verify:platform-authorization` and the control-tower auth invariant.
- The cross-database export archive is covered by the per-app suites and the
  cross-app deletion/export assertions; there is no browser download of a
  finished cross-app archive in this suite yet. The per-app
  `GET /internal/v1/organizations/:id/export` routes and the streaming
  `files`/`messages` content routes are exercised by the export probe.
