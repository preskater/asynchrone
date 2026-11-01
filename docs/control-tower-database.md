# The control-tower database

The control tower owns `asynchrone_control_tower` (ADR 0032, ADR 0034). It
signs operators in against that database, writes its platform audit trail there,
and reads every customer read model through Copilot's
`/internal/v1/admin/*` API. It never opens a connection to
`asynchrone_identity` or any other app's database — `npm run check:boundaries`
fails if the app imports `@workspace/db`.

## What lives where

| Data | Database | Read by the control tower through |
| ---- | -------- | --------------------------------- |
| Platform users, sessions, accounts, TOTP rows | `asynchrone_control_tower` | `@workspace/db-control-tower` (Better Auth) |
| `PlatformAuditEvent` | `asynchrone_control_tower` | `@workspace/db-control-tower` |
| `PlatformHandoff` (copy) | `asynchrone_control_tower` | schema parity only (see below) |
| Organizations, members, plans, trials, bans | `asynchrone_identity` | `IdentityAdminClient` (`internal:identity:admin`) |
| Customer audit rows | `asynchrone_identity` | `IdentityAdminClient.listAudit` |
| Platform handoffs claimed by the customer app | `asynchrone_identity` | `POST /internal/v1/admin/handoffs` |

`PlatformHandoff` exists in both schemas. The **live** handoff row is created by
Copilot when the control tower calls `createHandoff`, because
`apps/web/app/api/platform/handoff/route.ts` must claim it in the same
transaction that opens the impersonated session. The control-tower copy is kept
in the schema (and copied by the cutover script) so a future move of the claim
path does not need another migration. No cookies are shared between the two
origins (ADR 0018).

## Not on the control-tower pages (yet)

The split moved project, task, file and repository data to their own apps, so
the control tower cannot show aggregate project/task counts, storage usage,
repository connections or upload sessions until those apps expose an internal
read model. The pages show only identity-owned data; the aggregate metrics are
tracked as a follow-up to the domain-apps milestone. Do not reintroduce a
cross-database query for them.

## Configuration

`apps/control-tower/.env`:

- `CONTROL_TOWER_DATABASE_URL` — required, and never `DATABASE_URL`: the app
  refuses to boot without it so a copied customer `.env` cannot point platform
  sign-in at the identity database.
- `CONTROL_TOWER_BETTER_AUTH_SECRET` — own secret, ≥ 32 characters, different
  from `BETTER_AUTH_SECRET`.
- `BETTER_AUTH_URL`, `PLATFORM_APP_URL`, `CONTROL_TOWER_OAUTH_CLIENT_ID/SECRET`,
  optional `PLATFORM_ALLOWED_IPS`.

The host-only cookie (`asynchrone-space-control-tower.session_token`) and the
absence of `advanced.crossSubDomainCookies` are unchanged; `npm run
verify:auth-config --workspace=control-tower` asserts both.

## Cutover procedure

The cutover is part of the maintenance window that also runs
`npm run split:databases` (#185). The source is the monolith database
(`DATABASE_URL`, or `CONTROL_TOWER_SOURCE_DATABASE_URL` for a snapshot); the
target is `CONTROL_TOWER_DATABASE_URL`.

```bash
# 0. Prerequisites: target exists and is migrated.
npm run db:create
npm run migrate:deploy

# 1. Freeze writes to the customer app (and therefore to the control tower's
#    source tables), then snapshot the monolith database.

# 2. Rehearse. Dry run prints what would be copied and changes nothing.
npm run cutover:control-tower --workspace=control-tower -- --dry-run

# 3. Apply inside the window.
npm run cutover:control-tower --workspace=control-tower -- --apply

# 4. Prove it.
npm run cutover:control-tower --workspace=control-tower -- --verify
npm run verify:platform-authorization --workspace=control-tower
npm run verify:auth-config --workspace=control-tower

# 5. Deploy the control-tower image with CONTROL_TOWER_DATABASE_URL set, sign
#    in with an operator account and complete a TOTP challenge. Unfreeze.
```

What it copies, and what it deliberately does not:

- **Copied:** users whose `role` contains `platform_admin` or `platform_support`
  (plus their `account` rows with the password hash, their `session` rows and
  their `twoFactor` rows), the whole `platformAuditEvent` trail and the whole
  `platformHandoff` table. IDs are preserved.
- **Not copied:** customer users, organizations, members, invitations, OAuth
  clients, JWKS rows (encrypted with the customer app's secret and unused here)
  and `verification` tokens. The platform database is not a second copy of the
  customer directory; `--verify` fails if a non-platform account is present.

The script is idempotent: every insert is `ON CONFLICT (id) DO NOTHING`, so it
can be re-run at the end of the window to pick up writes made after the dry run,
and a re-run never overwrites a role granted in the control tower. `--reset`
truncates the six copied tables first and only works together with `--apply`.

Because `account` rows (with the password hash) are copied, an operator's
customer-app password also opens the control tower until it is changed. If the
two surfaces must not share a credential, ask operators to rotate the password
after the cutover; the control tower has no password-reset mailer of its own.

### Provisioning a new operator

New operators sign up in the customer app (the control tower has no sign-up),
then are copied over and granted a role:

```bash
npm run cutover:control-tower --workspace=control-tower -- --user you@example.com --apply
npm run grant:platform-role --workspace=control-tower -- --email you@example.com --role platform_admin
```

`--user` copies a single account and skips the shared audit trail. The operator
signs in with the password they set in the customer app and enrolls TOTP at
`/setup-2fa` (every platform role requires it).

### Rollback

The copy is additive and never deletes source rows, so rollback is a
configuration change:

1. Keep the previous control-tower image deployed or re-deploy it; it read
   `DATABASE_URL` against the monolith/identity database.
2. Point `CONTROL_TOWER_DATABASE_URL` back at the old database (or restore the
   old Secret key `DATABASE_URL`) and roll the pods: `kubectl -n
   asynchrone-space rollout restart deploy/asynchrone-space-control-tower`.
3. Re-freeze and reconcile: sessions created in the control-tower database
   during the cutover are lost when you roll back. Copy nothing back — the
   source is still authoritative for users, and platform audit rows written in
   the new database after the cutover (actions taken in the new instance) must be
   replayed into the old one before it is retired, or accepted as lost and noted
   in the incident log.
4. The rollback window closes when the old database becomes read-only. Keep it
   readable for at least one week, as for every other database in the split.

## Verification

| Command | Needs a database | Covers |
| ------- | ---------------- | ------ |
| `npm run verify:auth-config --workspace=control-tower` | no | host-only cookie, own secret, sign-up disabled, 2FA plugin |
| `npm run verify:platform-authorization --workspace=control-tower` | yes | role parsing, IP allowlist, single-use handoff, platform-only accounts, and a real sign-in against the platform database |
| `npm run cutover:control-tower --workspace=control-tower -- --verify` | yes | copied operators, no non-platform accounts, row-count floor per table |
| `npm run check:boundaries` | no | the control tower does not import `@workspace/db` |
