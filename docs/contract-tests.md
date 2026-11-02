# Cross-domain contract tests

The suite lives in [`apps/copilot/scripts/contracts`](../apps/copilot/scripts/contracts)
and runs against the public package entrypoints Copilot binds:

```bash
# from the repository root, with a migrated PostgreSQL
npm run test:contracts

# or directly in the app
npm run test:contracts --workspace=copilot
```

It needs `IDENTITY_DATABASE_URL` (or `DATABASE_URL`) pointing at a database with
the monolith migrations applied (`cd packages/db && npx prisma migrate deploy`).
It never starts a browser. The `contracts` CI job provisions PostgreSQL,
generates every Prisma client, migrates and runs the suite.

## What it pins

| Area                | Contract                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package exports     | Every `exports` target of the domain packages must exist; the server-safe entrypoints must import and keep their named exports. A removed or renamed export fails the test and `typecheck`.          |
| Member directory    | `toMemberDirectoryEntry` / `toDirectoryEntry` role mapping used by every app and the identity internal API.                                                                                            |
| Notifications       | Recipients must belong to the organization, idempotency keys create once, reads and mark-all-read are scoped to the active organization.                                                             |
| Recents             | The storage key is per organization and every app bucket normalizes.                                                                                                                                 |
| Search              | Copilot keeps the HTTP fan-out only (`lib/search/in-process.ts` is gone); the route organization, locale and acting user are forwarded, and a down app yields `partial`.                              |
| Export/deletion     | Owners only, one export in flight, grace period, tenant isolation, saga readiness and authorized internal handlers.                                                                                  |
| MCP/assistant tools | Every tool runs through `DomainClient` (`/internal/v1/domain/:operation`), never an in-process domain adapter, Prisma client or ad-hoc `fetch`; reads retry, unkeyed mutations do not, and cross-organization calls surface a typed `not_found`. |
| Assistant history   | Accepted user turns and completed assistant parts are stored, the reload rebuilds the same model input, the list is scoped to the signed-in user, deleting a conversation cascades its messages, and another organization or another member cannot read, extend or delete a conversation. |
| Issue #40           | Replayed by each domain app's `e2e/authorization.spec.ts` against the live per-app database; the contract suite covers the pure context and directory rules.                                         |

## Adding a domain

1. Add the package's server entrypoints to
   [`exports.contract.test.ts`](../apps/copilot/scripts/contracts/exports.contract.test.ts).
2. Mount the standard internal surface in the app (`/internal/v1/search`,
   `/internal/v1/audit*`, the export/delete saga routes and
   `/internal/v1/domain/:operation`) and add its e2e authorization spec.
3. If it exposes MCP/assistant tools, add the adapter assertion in
   [`mcp-assistant.contract.test.ts`](../apps/copilot/scripts/contracts/mcp-assistant.contract.test.ts).

Search fans out over HTTP only. The assistant, MCP tools and portal call
`/internal/v1/domain/:operation` through `DomainClient`; the contract suite pins
the typed client (retry, typed errors, idempotency keys).

## Browser coverage

The contract suite never starts a browser. What only exists with several live
hosts — the OIDC lifecycle, back-channel logout, organization-switch revocation,
the impersonation handoff, audience-bound service tokens and a peer that is down
— lives in the cross-app Playwright suite:

```bash
npm run test:e2e --workspace=@workspace/e2e
```

It drives Copilot, projects and calendars on separate hosts and provisions its
OAuth clients by spawning the per-app bootstraps. See
[cross-app-e2e.md](./cross-app-e2e.md) for the coverage table and the ports.
