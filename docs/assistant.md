# Copilot assistant

The assistant lives in `apps/copilot` and is the workspace home
(`/[locale]/[orgSlug]`). It reuses `@workspace/ai` and calls the domain packages
in process for its tools. This document covers stage 1 (text chat). Call capture,
transcription and action items are out of scope (ADR 0031, stage 2).

## Ownership

| Concern            | Location                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| Shared chat pieces | `packages/ai/src/{chat,conversations,agent,model,pricing,usage,suggestions}.ts` |
| Client store       | `packages/ai/src/use-assistant.tsx`                                      |
| Agent and tools    | `apps/copilot/lib/assistant/{agent,tools}.ts`                            |
| Persistence        | `apps/copilot/lib/assistant/{conversations,history}.ts`                  |
| HTTP API           | `apps/copilot/app/api/assistant/{route.ts,conversations/route.ts,conversations/[conversationId]/route.ts}` |
| UI                 | `apps/copilot/components/assistant/*`                                    |

`@workspace/ai` never opens a database; Copilot binds its Prisma client in
`lib/assistant/conversations.ts`.

## Models

Both tables live in the identity database (`@workspace/db-identity`) and in the
monolith schema until #185. The migration is additive
(`20261101120000_assistant_conversations`).

| Model                   | Columns                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AssistantConversation` | `id`, `organizationId`, `userId`, `title`, `createdAt`, `updatedAt`, index `(organizationId, userId, updatedAt)` |
| `AssistantMessage`      | `id`, `conversationId`, `role`, `parts` JSON, `createdAt`, index `(conversationId, createdAt)`                   |

`parts` is the same JSON the client renders: `text`, `reasoning` and `tool`
(call + output) parts. Reasoning is stored for display only and is never replayed
to the model; `toAgentInput` rebuilds text turns and paired
`function_call`/`function_call_result` items, so the history is deterministic.

`title` is derived from the first user message (whitespace collapsed, 80
characters) and stays empty for a conversation created by "New chat" until the
first turn. Renaming is not exposed yet (`AssistantConversation.title` keeps the
derived value).

## API

### `GET /api/assistant/conversations`

Returns `{ conversations: [{ id, title, updatedAt }] }` for the signed-in user
in the active organization, newest first, capped at 100. `updatedAt` is an ISO
string so the client can order the list without a database. The home page calls
this through `listConversations` on the server; the client refreshes it after a
turn and never asks for another member's list.

### `POST /api/assistant/conversations`

Creates an empty conversation (`201 { conversation }`) so "New chat" has a
stable id that survives a reload. The request body is not read. The endpoint is
same-origin only (`rejectCrossOrigin`), and the created row carries the active
organization and the signed-in user.

### `DELETE /api/assistant/conversations/:conversationId`

Deletes one of the signed-in user's conversations; the schema cascades the
messages. A foreign, unknown or already-deleted id is a `404`, so the endpoint
never reveals whether another member's conversation exists. It is same-origin
only as well.

### `POST /api/assistant`

Body: `{ conversationId?: string, text: string }`, strict — a request that carries
`messages` (or any other key) is rejected with `422`, so the client cannot inject
assistant text or tool output.

1. `conversationId` is resolved with `where: { id, organizationId, userId }`.
   Another organization's or another member's id behaves like a missing one
   (`404 not_found`).
2. Without an id a conversation is created with the derived title.
3. The user message is persisted before the model call. The history replayed to
   the model is the last 40 stored turns plus the new text.
4. The response is the existing NDJSON stream (`text`, `reasoning`, `tool_call`,
   `tool_output`, `error`, `done`). The server applies the same
   `applyAssistantEvent` reducer the client uses, so the stored parts match what
   the user saw. The conversation id is returned in the
   `X-Assistant-Conversation-Id` header.
5. `completeTurn` writes the assistant parts only after the stream completed and
   only when the request was not aborted. A failed or cancelled stream leaves the
   accepted user message and no half-written answer, so the conversation stays
   usable and the next turn replays a valid history.

Usage is still one `AiUsageEvent` per run, including aborted runs.

### `GET /api/assistant?conversationId=…`

Returns `{ id, title, messages }` for the signed-in user's conversation, newest
200 turns, with `Cache-Control: no-store`. Foreign, deleted and unknown ids are
`404`, which tells the client to start a new conversation.

## Client

Copilot is the organization home: `/{locale}/{orgSlug}` renders the assistant.
There is no separate shell to redirect to — `/{locale}` still sends a signed-in
member to their active organization and `/mcp` stays in `apps/copilot`.

The page loads `listConversations` on the server and passes the result to
`AssistantProvider` (`packages/ai/src/use-assistant.tsx`), so the rail is
present on first paint. The provider remembers only the current conversation id
in `localStorage` under `assistant:conversation:<organizationId>` and reloads the
transcript from the server on mount. `sendMessage({ text })` posts
`{ conversationId?, text }` and never sends history. Switching organizations
switches the storage key, and the server rejects a stale id from another
organization.

Every assistant call also carries an `X-Organization-Id` header with the
organization in the URL. The shell keeps the active organization in the
session and `OrganizationSync` updates it after a cross-organization
navigation; the header keeps the list, reload, create and delete endpoints on
the organization the page is showing during that window. It is not trusted:
`getRequestContextForOrganization` verifies the signed-in user's membership
before any query.

The UI (`components/assistant/*`) renders:

- a conversation rail (desktop) and a sheet triggered from the top bar (mobile),
  with a "New chat" button, the relative update time and the active row marked
  with `aria-current="page"`;
- an empty welcome with suggestions, a loading skeleton while a conversation is
  fetched, and an error banner with a retry action;
- the streaming transcript with text, reasoning and expandable tool cards (the
  arguments and the output of each call);
- a delete confirmation (`AlertDialog`) per requested conversation.

"New chat" creates an empty conversation through the API and selects it. When
the current conversation is already empty it is reused, so clicking twice does
not fill the list with empty rows. Sending the first message derives the title;
the provider refreshes the list after the turn so the title and the ordering
catch up. Deleting the active conversation clears the selection and the stored
id; deleting another row leaves the transcript alone.

Status announcements stay polite: the screen reader hears "Thinking" once per
turn and "Response ready", never every token. Animations are `motion-reduce`
safe and every new control is a native button or sheet trigger.

## Isolation and retention

- Every read and write filters on both `organizationId` and `userId`; a
  cross-organization or cross-user id is a `404`, never a partial read. The list
  and the delete endpoint use the same filter.
- The organization FK cascades on deletion. Deleting a personal account removes
  the user's conversations in the account-deletion transaction, and deleting a
  conversation cascades its messages.
- Data export includes `assistantConversation` and `assistantMessage`.

## Tests

| Layer      | Location                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Unit       | `packages/ai/src/{chat,conversations}.unit.test.ts`, `apps/copilot/lib/assistant/history.unit.test.ts`      |
| Route      | `apps/copilot/app/api/assistant/route.unit.test.ts`, `apps/copilot/app/api/assistant/conversations/route.unit.test.ts` (mocks the agent and the store) |
| Contracts  | `apps/copilot/scripts/contracts/assistant-persistence.contract.test.ts` (migrated PostgreSQL, no browser)   |
| E2E        | `apps/copilot/e2e/assistant.spec.ts` (server-loaded list, reopen, new chat, reload persistence, delete, mobile sheet) |

The e2e spec runs without an OpenAI key: it seeds conversations through SQL and
creates empty conversations through the API, so the reload, create, reopen and
delete flows run without a model call.
