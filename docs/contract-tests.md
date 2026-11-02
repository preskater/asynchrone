# Cross-domain contract tests

The suite lives in [`apps/copilot/scripts/contracts`](../apps/copilot/scripts/contracts)
and runs against the public package entrypoints Copilot binds:

```bash
# from the repository root, with a migrated PostgreSQL
npm run test:contracts

# or directly in the app
npm run test:contracts --workspace=copilot
```

It needs `DATABASE_URL` pointing at a database with the monolith migrations
applied (`cd packages/db && npx prisma migrate deploy`). It never starts a
browser. The `contracts` CI job provisions PostgreSQL, generates both Prisma
clients, migrates and runs the suite.

## What it pins

| Area                | Contract                                                                                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package exports     | Every `exports` target of the domain packages must exist; the server-safe entrypoints must import and keep their named exports. A removed or renamed export fails the test and `typecheck`.          |
| Member directory    | `toMemberDirectoryEntry` role mapping, internal members only, portal accounts never get an internal context.                                                                                         |
| Notifications       | Recipients must belong to the organization, idempotency keys create once, reads and mark-all-read are scoped to the active organization.                                                             |
| Recents             | The storage key is per organization and every app bucket normalizes.                                                                                                                                 |
| Search              | Copilot keeps the fan-out but reads in-process domains through their packages; an in-process adapter never answers for another organization and never exposes a conversation to an uninvited member. |
| Export/deletion     | Owners only, one export in flight, grace period, tenant isolation, saga readiness and authorized internal handlers.                                                                                  |
| MCP/assistant tools | Every tool runs through `DomainClient` (`/internal/v1/domain/:operation`), never an in-process domain adapter, Prisma client or ad-hoc `fetch`; reads retry, unkeyed mutations do not, and cross-organization calls surface a typed `not_found`. |
| Assistant history   | Accepted user turns and completed assistant parts are stored, the reload rebuilds the same model input, the list is scoped to the signed-in user, deleting a conversation cascades its messages, and another organization or another member cannot read, extend or delete a conversation. |
| Issue #40           | The cross-org subtask toggle, forged context, reaction and calendar-attendee attacks are replayed against the packages and the database is inspected afterwards.                                     |

## Adding a domain

1. Add a live check to
   [`authorization.contract.test.ts`](../apps/copilot/scripts/contracts/authorization.contract.test.ts)
   that reads and writes a fixture id from another organization.
2. Add the package's server entrypoints to
   [`exports.contract.test.ts`](../apps/copilot/scripts/contracts/exports.contract.test.ts).
3. If the domain participates in global search, add it to
   [`in-process.ts`](../apps/copilot/lib/search/in-process.ts) until it becomes a
   separate app, then point `*_APP_URL` at it and let `searchRemotes()` take
   over.
4. If it exposes MCP/assistant tools, add the adapter assertion in
   [`mcp-assistant.contract.test.ts`](../apps/copilot/scripts/contracts/mcp-assistant.contract.test.ts).

Search still reads in-process domains through their packages. The assistant,
MCP tools and portal call `/internal/v1/domain/:operation` through
`DomainClient`; the contract suite pins the typed client (retry, typed errors,
idempotency keys) and the live domain apps reject the cross-organization cases.

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
[cross-app-e2e.md](./cross-app-e2e.md) for the coverage table, the ports and the
known gaps (the domain apps do not mount the audit/search/saga routes yet).
