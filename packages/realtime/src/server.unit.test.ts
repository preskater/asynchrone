import { EventEmitter } from "node:events"

import { describe, expect, it, vi } from "vitest"

import {
  REALTIME_CHANNEL,
  createHub,
  eventStream,
  parseEvent,
  publish,
  type RealtimeListener,
} from "./server"

class FakeClient extends EventEmitter {
  query = vi.fn(async () => ({}))
  release = vi.fn()
  notify(payload: string, channel = REALTIME_CHANNEL) {
    this.emit("notification", { channel, payload, processId: 1 })
  }
}

function fakePool() {
  const clients: FakeClient[] = []
  return {
    clients,
    connect: vi.fn(async () => {
      const client = new FakeClient()
      clients.push(client)
      return client as never
    }),
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("parseEvent", () => {
  it("keeps only well-formed hints", () => {
    expect(parseEvent('{"organizationId":"o","topic":"t"}')).toEqual({
      organizationId: "o",
      topic: "t",
    })
    expect(parseEvent('{"topic":"t"}')).toBeNull()
    expect(parseEvent('{"organizationId":"o","topic":"t","userId":1}')).toBe(
      null
    )
    expect(parseEvent("not json")).toBeNull()
    expect(parseEvent(undefined)).toBeNull()
  })
})

describe("publish", () => {
  it("notifies the shared channel and never throws", async () => {
    const query = vi.fn(async () => ({}))
    await publish({ query } as never, { organizationId: "o", topic: "t" })
    expect(query).toHaveBeenCalledWith("SELECT pg_notify($1, $2)", [
      REALTIME_CHANNEL,
      '{"organizationId":"o","topic":"t"}',
    ])

    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(
      publish({ query: vi.fn().mockRejectedValue(new Error("down")) }, {
        organizationId: "o",
        topic: "t",
      })
    ).resolves.toBeUndefined()
    error.mockRestore()
  })
})

describe("createHub", () => {
  it("listens once and fans out to every subscriber", async () => {
    const pool = fakePool()
    const hub = createHub(pool)
    const a = vi.fn<RealtimeListener>()
    const b = vi.fn<RealtimeListener>()
    hub.subscribe(a)
    const stopB = hub.subscribe(b)
    await flush()

    expect(pool.connect).toHaveBeenCalledTimes(1)
    expect(pool.clients[0]!.query).toHaveBeenCalledWith(
      `LISTEN ${REALTIME_CHANNEL}`
    )

    pool.clients[0]!.notify('{"organizationId":"o","topic":"t"}')
    pool.clients[0]!.notify('{"organizationId":"o","topic":"t"}', "other")
    pool.clients[0]!.notify("garbage")
    stopB()
    pool.clients[0]!.notify('{"organizationId":"o","topic":"u"}')

    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it("reconnects after a lost connection and asks for a resync", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const pool = fakePool()
    const hub = createHub(pool, { retryMs: 1 })
    const listener = vi.fn<RealtimeListener>()
    hub.subscribe(listener)
    await flush()

    pool.clients[0]!.emit("error", new Error("terminated"))
    pool.clients[0]!.emit("error", new Error("terminated again"))
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(pool.clients[0]!.release).toHaveBeenCalledTimes(1)
    expect(pool.connect).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenCalledWith(null)
    error.mockRestore()
  })
})

describe("eventStream", () => {
  it("sends accepted hints without their content and stops on abort", async () => {
    let listener: RealtimeListener = () => {}
    const unsubscribe = vi.fn()
    const hub = {
      subscribe: (next: RealtimeListener) => {
        listener = next
        return unsubscribe
      },
    }
    const abort = new AbortController()
    const response = eventStream(
      new Request("http://test/stream", { signal: abort.signal }),
      hub,
      (event) => event.organizationId === "mine"
    )
    expect(response.headers.get("Content-Type")).toContain("text/event-stream")

    listener({ organizationId: "other", topic: "messaging" })
    listener({ organizationId: "mine", topic: "messaging", userId: "u" })
    listener(null)
    abort.abort()

    const body = await new Response(response.body).text()
    expect(body).toBe(
      'retry: 3000\n\ndata: {"topic":"messaging"}\n\ndata: {"topic":"resync"}\n\n'
    )
    expect(unsubscribe).toHaveBeenCalled()
  })
})
