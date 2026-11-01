# Copilot assistant

The assistant lives in `apps/copilot` and is the workspace home
(`/[locale]/[orgSlug]`). It reuses `@workspace/ai` and calls the domain packages
in process for its tools. This document covers stage 1 (text chat). Call capture,
transcription and action items are out of scope (ADR 0031, stage 2).

## Ownership

| Concern            | Location                                                                 |
| ------------------ | ------------------------------------------------------------------------ |
| Shared chat pieces | `packages/ai/src/{chat,agent,model,pricing,usage,suggestions}.ts`        |
| Client store       | `packages/ai/src/use-assistant.tsx`                                      |
| Agent and tools    | `apps/copilot/lib/assistant/{agent,tools}.ts`                            |
| Persistence        | `apps/copilot/lib/assistant/{conversations,history}.ts`                  |
| HTTP API           | `apps/copilot/app/api/assistant/route.ts`                                |
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
characters). Renaming and the conversation list belong to #166.

## API

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

`AssistantProvider` takes the active `organizationId`. It remembers only the
current conversation id in `localStorage` under
`assistant:conversation:<organizationId>` and reloads the transcript from the
server on mount. `sendMessage({ text })` posts `{ conversationId?, text }` and
never sends history. Switching organizations switches the storage key, and the
server rejects a stale id from another organization.

The conversation list, new-chat button and renaming are #166.

## Isolation and retention

- Every read and write filters on both `organizationId` and `userId`; a
  cross-organization or cross-user id is a `404`, never a partial read.
- The organization FK cascades on deletion. Deleting a personal account removes
  the user's conversations in the account-deletion transaction.
- Data export includes `assistantConversation` and `assistantMessage`.

## Tests

| Layer      | Location                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Unit       | `packages/ai/src/chat.unit.test.ts`, `apps/copilot/lib/assistant/history.unit.test.ts`                      |
| Route      | `apps/copilot/app/api/assistant/route.unit.test.ts` (mocks the agent and the store)                         |
| Contracts  | `apps/copilot/scripts/contracts/assistant-persistence.contract.test.ts` (migrated PostgreSQL, no browser)   |
| E2E        | `apps/copilot/e2e/assistant.spec.ts` (seeds a conversation, reloads, checks the server transcript)          |

The e2e spec runs without an OpenAI key: it seeds a conversation through SQL and
exercises the reload path, which is what the acceptance criterion covers.
