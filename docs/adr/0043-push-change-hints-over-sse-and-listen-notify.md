# 0043. Push change hints over SSE and PostgreSQL LISTEN/NOTIFY

- Status: accepted
- Date: 2026-11-13
- Deciders: platform
- Issue: #98

## Context

Messaging refreshed by polling every five seconds, the notification bell only
when it was opened, and task comments only on a reload. Each app runs at least
two replicas, so an in-process event emitter cannot reach a browser connected to
another replica. The issue rules out CRDT editing, voice/video and presence.

## Considered options

1. **A managed pub/sub (Ably, Pusher).** No infrastructure, but a new
   sub-processor (legal pack), a new secret and organization data leaving our
   databases.
2. **Redis Streams + SSE.** Durable replay, but a new stateful service to run,
   back up and budget.
3. **SSE per app, fanned out across replicas with PostgreSQL `LISTEN/NOTIFY`,
   carrying hints only.** No new service or dependency; each app's own
   database is the bus.

## Decision

Option 3, in `@workspace/realtime`:

- A mutation publishes `pg_notify('asynchrone_realtime', {organizationId,
  topic, userId?})` after it commits. Publishing is best effort and never fails
  the mutation.
- Each replica checks **one** connection out of its own pool and `LISTEN`s on
  it, then fans hints out in memory to its SSE streams. The fleet connection
  budget (ADR 0038) is unchanged; one pool slot per replica is dedicated to
  listening once a browser subscribes.
- A hint carries **no content**, only the topic. The browser re-reads through
  the app's existing, authorized route handlers (never server actions, see
  #171). The stream therefore cannot leak data, and the stream route filters on
  the session's organization (and user, for notifications) anyway.
- Catch-up is a re-read: `EventSource` reconnects on its own, and every
  (re)connection triggers the same read. A listener that loses its database
  connection reconnects with backoff and asks every stream to resync.
- Streams close after five minutes so the session is checked again on
  reconnect, send a heartbeat every 25 s, and set `X-Accel-Buffering: no` so
  nginx does not buffer them.
- Messaging keeps its five-second poll only while the stream is down.

Topics today: `messaging` (messages app), `notifications` (Copilot, per user)
and `task-comments` (projects app).

## Consequences

- New messages, notifications and task comments appear without a refresh, on
  any replica, with no new infrastructure.
- A hint triggers a full read of the affected view for every connected member
  of the organization; that is no more load than the polling it replaces, but
  a very large organization may need finer topics later.
- A revoked session can keep receiving content-free hints for at most five
  minutes.
- Presence and typing stay on polling; adding them later is a new topic.
