import { describe, expect, it, vi } from "vitest"

import { InvalidationClient } from "./invalidation"

const request = {
  organizationId: "org_1",
  organizationSlug: "acme",
  paths: ["/en/acme/clients"],
  tags: ["clients"],
  reason: "test",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("InvalidationClient", () => {
  it("posts to /internal/v1/invalidate with the cache scope", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return jsonResponse({ app: "clients", revalidated: 2 })
    }) as unknown as typeof fetch
    const getToken = vi.fn(async () => "token")

    const client = new InvalidationClient({
      app: "clients",
      baseUrl: "https://clients.example",
      getToken,
      fetchImpl,
    })
    const result = await client.invalidate(request)

    expect(result).toEqual({ app: "clients", revalidated: 2 })
    expect(getToken).toHaveBeenCalledWith({
      audience: "urn:asynchrone:app:clients",
      scopes: ["internal:cache:write"],
    })
    expect(calls[0]?.url).toBe("https://clients.example/internal/v1/invalidate")
    expect(calls[0]?.init.method).toBe("POST")
    expect(
      (calls[0]?.init.headers as Record<string, string>).Authorization
    ).toBe("Bearer token")
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(request)
  })

  it("throws with the app name when the target rejects the call", async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        { error: { code: "insufficient_scope", message: "nope" } },
        403
      )) as unknown as typeof fetch
    const client = new InvalidationClient({
      app: "files",
      baseUrl: "https://files.example",
      getToken: async () => "token",
      fetchImpl,
    })
    await expect(client.invalidate(request)).rejects.toThrow(
      "files: insufficient_scope (403)"
    )
  })
})
