# Cut the control tower over to its own database

- Status: accepted
- Deciders: Asynchrone Space maintainers
- Date: 2026-11-01

## Context and Problem Statement

ADR 0032 gives every workspace app its own PostgreSQL database and lists
`asynchrone_control_tower` as the owner of platform auth, platform 2FA, platform
audit and handoff state. Until now the control tower still connected to the
identity/monolith database through `@workspace/db`: it read customer users,
organizations and files directly, and its Better Auth tables lived next to the
customer ones.

The foundation (#191) moved customer mutations behind
`/internal/v1/admin/*`. How do we finish the isolation without landing the
customer app and the control tower on the same schema, and without locking
operators out during the switch?

## Decision Drivers

- **Blast radius.** A platform-admin deploy must not be able to read or lock
  customer tables, and an identity migration must not break sign-in.
- **Least data.** The platform database must not become a second copy of the
  customer directory (PII, organizations, sessions).
- **No downtime for operators.** Sessions and TOTP devices must survive the
  switch.
- **Reversibility.** The maintenance window must be able to roll back to the
  old database without negotiating data back.
- **Boundaries.** The build must fail if the app reaches for the identity
  client again.

## Considered Options

1. Keep the shared schema and rely on the admin API only for mutations.
2. Give the control tower its own database and copy the platform rows into it.
3. Give the control tower its own database and provision operators from scratch
   (new passwords, new TOTP enrollment).

## Decision Outcome

Chosen option: **2 — own database, filtered copy of the platform rows.**

- `apps/control-tower/lib/auth.ts`, `lib/platform/audit.ts`,
  `scripts/grant-platform-role.ts` and `scripts/verify-platform-authorization.ts`
  use `@workspace/db-control-tower`.
- Only accounts that carry a platform role are copied, together with their
  `account` (password hash), `session` and `twoFactor` rows, the whole
  `platformAuditEvent` trail and the `platformHandoff` table. Customer users,
  organizations, OAuth clients, JWKS rows and verification tokens are not
  copied; customer read models come from the identity admin API.
- `CONTROL_TOWER_DATABASE_URL` is required (no `DATABASE_URL` fallback), so a
  copied customer environment cannot silently point platform sign-in at the
  identity database.
- `scripts/cutover-control-tower.ts` is the only code that reads the source
  database. It is idempotent (`ON CONFLICT (id) DO NOTHING`), defaults to a dry
  run, and supports `--verify`, `--reset` and `--user <email>` provisioning.
- The host-only session cookie, the separate secret and the single-use handoff
  remain unchanged. `advanced.crossSubDomainCookies` stays disabled.
- `scripts/check-boundaries.mjs` rejects any `@workspace/db` import from
  `apps/control-tower`.
- Plan and trial rules moved from `packages/db` to `@workspace/core` so no app
  needs the database package for pure functions.

### The handoff row stays in the identity database

ADR 0032 lists handoff state as control-tower-owned. In practice the claim
happens in `apps/web/app/api/platform/handoff/route.ts`, which must mark the
row used and open the impersonated session in one transaction, inside the
customer app's database. The control tower therefore creates handoffs through
`POST /internal/v1/admin/handoffs` (the row lands in `asynchrone_identity`), and
keeps an empty-but-identical `platformHandoff` table in its own database for
schema parity. Moving the claim path is a separate decision; sharing the table
across databases is not an option.

## Consequences

### Positive

- Platform sign-in, 2FA and audit no longer depend on the identity database.
- The platform database holds only operator identities, which keeps its backup,
  retention and access scope small.
- Cutover and rollback are scripted, idempotent and rehearsable.

### Negative

- Operators are provisioned in two steps (sign up in the customer app, then
  `cutover --user` + `grant:platform-role`).
- The control tower shows less than before until domain apps expose internal
  read models: no project/task counts, storage usage, repository connections or
  upload sessions.
- A rollback loses platform sessions and audit rows written after the cutover
  in the new database.
- Two copies of the platform auth schema must stay in sync until the customer
  app's `user`/`session` tables stop carrying platform roles.

## Links

- [0032](0032-give-each-app-its-own-database.md) — per-app databases
- [0018](0018-control-tower-on-shared-database-package.md) — control-tower
  isolation and the handoff design
- [Runbook](../control-tower-database.md)
- Issue [#209](https://github.com/preskater/asynchrone-space/issues/209)
