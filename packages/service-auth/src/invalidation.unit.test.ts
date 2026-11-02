import { describe, expect, it, vi } from "vitest"

import type { InvalidateRequest } from "@workspace/contracts"

import { createInvalidationHandler } from "./invalidation"

function verifier() {
  return {
    verify: vi.fn(async () => ({
      iss: "https://copilot.example",
      sub: "copilot",
      aud: "urn:asynchrone:app:projects",
      scope: "internal:cache:write",
      exp: Math.floor(Date.now() / 1000) + 60,
      client_id: "copilot",
    })),
  } as never
}

function request(body: unknown, token = "token") {
  return new Request("https://projects.example/internal/v1/invalidate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-request-id": "11111111-1111-4111-8111-111111111111",
    },
    body: JSON.stringify(body),
  })
}

const payload: InvalidateRequest = {
  organizationId: "org_1",
  organizationSlug: "acme",
  paths: ["/en/acme/clients", "/fr/acme/clients"],
  tags: ["clients"],
  reason: "portal-access",
}

describe("invalidation handler", () => {
  it("revalidates the requested paths and echoes the correlation id", async () => {
    const revalidate = vi.fn()
    const handler = createInvalidationHandler({
      app: "projects",
      verifier: verifier(),
      revalidate,
    })
    const response = await handler(request(payload))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ app: "projects", revalidated: 3 })
    expect(revalidate).toHaveBeenCalledWith(payload)
    expect(response.headers.get("x-request-id")).toBe(
      "11111111-1111-4111-8111-111111111111"
    )
  })

  it("rejects a path that escapes or carries a query", async () => {
    const handler = createInvalidationHandler({
      app: "projects",
      verifier: verifier(),
      revalidate: vi.fn(),
    })
    for (const bad of ["../etc", "/en/acme?x=1", "//evil.example/x"]) {
      const response = await handler(request({ ...payload, paths: [bad] }))
      expect(response.status).toBe(400)
    }
  })

  it("rejects a missing token", async () => {
    const handler = createInvalidationHandler({
      app: "projects",
      verifier: verifier(),
      revalidate: vi.fn(),
    })
    const response = await handler(
      new Request("https://projects.example/internal/v1/invalidate", {
        method: "POST",
        body: JSON.stringify(payload),
      })
    )
    expect(response.status).toBe(401)
  })

  it("turns a failing revalidation into a 500", async () => {
    const handler = createInvalidationHandler({
      app: "projects",
      verifier: verifier(),
      revalidate: () => {
        throw new Error("boom")
      },
    })
    const response = await handler(request(payload))
    expect(response.status).toBe(500)
  })
})
