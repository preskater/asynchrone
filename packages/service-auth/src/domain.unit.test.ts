import { describe, expect, it, vi } from "vitest"

import { createDomainHandler } from "./domain"
import type { ServiceTokenVerifier } from "./verify"

function verifier(seen: string[][] = []): ServiceTokenVerifier {
  return {
    verify: async (_token: string, options: { requiredScopes?: string[] }) => {
      seen.push([...(options.requiredScopes ?? [])])
      return {
        iss: "https://copilot.test",
        sub: "copilot",
        aud: "urn:asynchrone:app:projects",
        scope: "internal:domain:read internal:domain:write",
        exp: Math.floor(Date.now() / 1000) + 60,
        client_id: "asynchrone-copilot",
      }
    },
  } as unknown as ServiceTokenVerifier
}

function request(body: unknown, key?: string): Request {
  return new Request(
    "https://projects.test/internal/v1/domain/create-project",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer service-token",
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    }
  )
}

const call = {
  context: {
    userId: "user_a",
    userName: "Alice",
    userEmail: "alice@example.com",
    organizationId: "org_a",
    role: "member",
    impersonatedBy: null,
    portal: null,
  },
  input: { name: "Project" },
}

const params = { params: Promise.resolve({ operation: "create-project" }) }

describe("createDomainHandler", () => {
  it("dispatches once for a retried mutation and replays the result", async () => {
    const dispatch = vi.fn(async () => ({ id: "project_a" }))
    const handle = createDomainHandler({
      app: "projects",
      verifier: verifier(),
      dispatch,
    })

    const first = await handle(request(call, "key-1"), params)
    const second = await handle(request(call, "key-1"), params)

    expect(dispatch).toHaveBeenCalledTimes(1)
    await expect(first.json()).resolves.toMatchObject({
      data: { id: "project_a" },
    })
    await expect(second.json()).resolves.toMatchObject({
      data: { id: "project_a" },
    })
  })

  it("does not replay a read call, even with a key", async () => {
    const dispatch = vi.fn(async () => ({ projects: [] }))
    const handle = createDomainHandler({
      app: "projects",
      verifier: verifier(),
      dispatch,
    })
    const readParams = {
      params: Promise.resolve({ operation: "list-projects" }),
    }

    await handle(request(call, "key-2"), readParams)
    await handle(request(call, "key-2"), readParams)

    expect(dispatch).toHaveBeenCalledTimes(2)
  })

  it("requires the write scope for a mutation and passes the delegated context", async () => {
    const scopes: string[][] = []
    const dispatch = vi.fn(async () => ({ id: "project_a" }))
    const handle = createDomainHandler({
      app: "projects",
      verifier: verifier(scopes),
      dispatch,
    })

    await handle(request(call, "key-3"), params)

    expect(scopes[0]).toContain("internal:domain:write")
    expect(dispatch).toHaveBeenCalledWith(
      "create-project",
      expect.objectContaining({
        context: expect.objectContaining({ organizationId: "org_a" }),
      })
    )
  })

  it("forwards a typed domain error without caching it", async () => {
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("Project not found"), {
          code: "not_found",
          status: 404,
        })
      )
      .mockResolvedValueOnce({ id: "project_a" })
    const handle = createDomainHandler({
      app: "projects",
      verifier: verifier(),
      dispatch,
    })

    const failed = await handle(request(call, "key-4"), params)
    expect(failed.status).toBe(404)
    await expect(failed.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    })

    const retried = await handle(request(call, "key-4"), params)
    expect(retried.status).toBe(200)
    expect(dispatch).toHaveBeenCalledTimes(2)
  })
})
