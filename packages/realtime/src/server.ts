import type { Notification, Pool, PoolClient } from "pg"

/**
 * Real-time change hints over PostgreSQL `LISTEN/NOTIFY` and Server-Sent
 * Events (ADR 0043, issue #98).
 *
 * A hint never carries content: it only says "something in <topic> changed for
 * this organization". The browser then re-reads through the app's existing,
 * authorized routes, so the stream cannot leak data and a missed hint is
 * repaired by the next read. Each app's database is its own NOTIFY namespace.
 */
export const REALTIME_CHANNEL = "asynchrone_realtime"

export interface RealtimeEvent {
  organizationId: string
  topic: string
  /** Set when only one user may receive the hint (their notifications). */
  userId?: string
}

/** `null` asks every subscriber to resync (the listener reconnected). */
export type RealtimeListener = (event: RealtimeEvent | null) => void

export interface RealtimeHub {
  subscribe(listener: RealtimeListener): () => void
}

/**
 * Publish a hint after a committed change. Best effort: the change already
 * happened and clients still catch up on their next read, so a failed NOTIFY
 * must never fail the mutation.
 */
export async function publish(
  pool: Pick<Pool, "query">,
  event: RealtimeEvent
): Promise<void> {
  try {
    await pool.query("SELECT pg_notify($1, $2)", [
      REALTIME_CHANNEL,
      JSON.stringify(event),
    ])
  } catch (error) {
    console.error("[realtime] publish failed", error)
  }
}

export function parseEvent(payload: string | undefined): RealtimeEvent | null {
  if (!payload) return null
  try {
    const value = JSON.parse(payload) as Partial<RealtimeEvent>
    if (
      typeof value.organizationId !== "string" ||
      typeof value.topic !== "string" ||
      (value.userId !== undefined && typeof value.userId !== "string")
    ) {
      return null
    }
    return {
      organizationId: value.organizationId,
      topic: value.topic,
      ...(value.userId ? { userId: value.userId } : {}),
    }
  } catch {
    return null
  }
}

/**
 * One `LISTEN` connection per process, fanned out in memory to the SSE
 * streams of that replica; NOTIFY reaches every replica on the same database.
 *
 * The connection is checked out of the app's own pool on the first subscriber
 * and kept, so the fleet budget (ADR 0038) does not change: one pool slot is
 * dedicated to listening. On a dropped connection it reconnects with backoff
 * and tells every subscriber to resync, since hints may have been lost.
 */
export function createHub(
  pool: Pick<Pool, "connect">,
  options: { retryMs?: number; maxRetryMs?: number } = {}
): RealtimeHub {
  const retryMs = options.retryMs ?? 1_000
  const maxRetryMs = options.maxRetryMs ?? 30_000
  const listeners = new Set<RealtimeListener>()
  let started = false
  let delay = retryMs

  const broadcast = (event: RealtimeEvent | null) => {
    for (const listener of listeners) listener(event)
  }

  async function connect(reconnecting: boolean): Promise<void> {
    let client: PoolClient | undefined
    let failed = false
    const fail = (error: unknown) => {
      if (failed) return
      failed = true
      console.error("[realtime] listener connection lost", error)
      client?.release(error instanceof Error ? error : new Error(String(error)))
      const timer = setTimeout(() => void connect(true), delay)
      timer.unref?.()
      delay = Math.min(delay * 2, maxRetryMs)
    }
    try {
      client = await pool.connect()
      client.on("error", fail)
      client.on("notification", (message: Notification) => {
        if (message.channel !== REALTIME_CHANNEL) return
        const event = parseEvent(message.payload)
        if (event) broadcast(event)
      })
      await client.query(`LISTEN ${REALTIME_CHANNEL}`)
      delay = retryMs
      if (reconnecting) broadcast(null)
    } catch (error) {
      fail(error)
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      if (!started) {
        started = true
        void connect(false)
      }
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * A Server-Sent Events response for one browser. `accept` decides which hints
 * this viewer may see; the caller resolves the viewer from the session, never
 * from the request. The stream closes after `maxAgeMs` so the browser
 * reconnects and the session is checked again.
 */
export function eventStream(
  request: Request,
  hub: RealtimeHub,
  accept: (event: RealtimeEvent) => boolean,
  options: { heartbeatMs?: number; maxAgeMs?: number } = {}
): Response {
  const encoder = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          cleanup()
        }
      }
      const unsubscribe = hub.subscribe((event) => {
        if (event === null) send(`data: {"topic":"resync"}\n\n`)
        else if (accept(event))
          send(`data: ${JSON.stringify({ topic: event.topic })}\n\n`)
      })
      // Proxies drop idle connections; a comment line keeps this one open.
      const heartbeat = setInterval(
        () => send(": ping\n\n"),
        options.heartbeatMs ?? 25_000
      )
      const maxAge = setTimeout(close, options.maxAgeMs ?? 300_000)
      cleanup = () => {
        unsubscribe()
        clearInterval(heartbeat)
        clearTimeout(maxAge)
      }
      request.signal.addEventListener("abort", close)
      send("retry: 3000\n\n")
    },
    cancel() {
      cleanup()
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // nginx would otherwise buffer the stream until it closes.
      "X-Accel-Buffering": "no",
    },
  })
}
