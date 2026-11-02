import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { CUSTOMER_APP_KEYS, internalAudience } from "@workspace/contracts"

import { revokeAppSessions } from "./app-sessions"

const ORIGIN = "https://copilot.example"

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

beforeAll(() => {
  process.env.COPILOT_APP_URL = ORIGIN
  process.env.COPILOT_OAUTH_CLIENT_ID = "asynchrone-copilot"
  process.env.COPILOT_OAUTH_CLIENT_SECRET = "secret"
  for (const key of CUSTOMER_APP_KEYS) {
    if (key === "copilot") continue
    process.env[`${key.toUpperCase()}_APP_URL`] = `https://${key}.example`
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("revokeAppSessions", () => {
  it("revokes the sid in every domain app with its own audience", async () => {
    const requests: Array<{
      url: string
      body: unknown
      authorization: string | null
    }> = []

    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith("/oauth2/token")) {
          const body = init?.body as URLSearchParams
          return json({
            access_token: `token-for-${body.get("resource")}`,
            token_type: "Bearer",
            expires_in: 300,
          })
        }
        requests.push({
          url,
          body: JSON.parse(String(init?.body)),
          authorization: new Headers(init?.headers).get("authorization"),
        })
        return new Response(null, { status: 204 })
      }
    )

    await revokeAppSessions("sid_1", { fetchImpl: fetchImpl as typeof fetch })

    const domains = CUSTOMER_APP_KEYS.filter((key) => key !== "copilot")
    expect(requests).toHaveLength(domains.length)
    expect(new Set(requests.map((request) => request.url))).toEqual(
      new Set(
        domains.map((key) => `https://${key}.example/internal/v1/auth/revoke`)
      )
    )
    for (const request of requests) {
      expect(request.body).toEqual({ sid: "sid_1" })
    }
    const audiences = new Set(
      requests.map((request) =>
        request.authorization?.replace(/^Bearer token-for-/, "")
      )
    )
    expect(audiences).toEqual(
      new Set(domains.map((key) => internalAudience(key)))
    )
  })

  it("skips the fan-out when the Copilot client is not configured", async () => {
    const previous = process.env.COPILOT_OAUTH_CLIENT_SECRET
    delete process.env.COPILOT_OAUTH_CLIENT_SECRET
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const fetchImpl = vi.fn()

    await revokeAppSessions("sid_1", { fetchImpl: fetchImpl as typeof fetch })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    process.env.COPILOT_OAUTH_CLIENT_SECRET = previous
  })

  it("never rejects when one app fails", async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith("/oauth2/token")) {
          return json({
            access_token: "token",
            token_type: "Bearer",
            expires_in: 300,
          })
        }
        return new Response(null, { status: 503 })
      }
    )
    vi.spyOn(console, "warn").mockImplementation(() => {})

    await expect(
      revokeAppSessions("sid_1", { fetchImpl: fetchImpl as typeof fetch })
    ).resolves.toBeUndefined()
  })
})
