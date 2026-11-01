import { beforeEach, describe, expect, it, vi } from "vitest"

import { NotFoundError } from "@workspace/core/errors"

const mocks = vi.hoisted(() => ({
  getRequestContext: vi.fn(),
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
}))

vi.mock("@/lib/assistant/context", () => ({
  assistantRequestContext: mocks.getRequestContext,
}))
vi.mock("@/lib/assistant/conversations", () => ({
  listConversations: mocks.listConversations,
  createConversation: mocks.createConversation,
  deleteConversation: mocks.deleteConversation,
}))

import { DELETE } from "./[conversationId]/route"
import { GET, POST } from "./route"

const ctx = {
  userId: "user_1",
  userName: "Alice",
  userEmail: "alice@example.com",
  organizationId: "org_1",
  role: "member" as const,
}

const conversation = {
  id: "conv_1",
  title: "",
  updatedAt: "2026-11-01T12:00:00.000Z",
}

function request(method: string, origin?: string) {
  return new Request("http://localhost:3000/api/assistant/conversations", {
    method,
    headers: origin ? { Origin: origin } : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getRequestContext.mockResolvedValue(ctx)
})

describe("GET /api/assistant/conversations", () => {
  it("returns the signed-in user's conversations without caching", async () => {
    mocks.listConversations.mockResolvedValue([conversation])

    const response = await GET(request("GET"))

    expect(mocks.listConversations).toHaveBeenCalledWith(ctx)
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    await expect(response.json()).resolves.toEqual({
      conversations: [conversation],
    })
  })
})

describe("POST /api/assistant/conversations", () => {
  it("creates an empty conversation and returns it", async () => {
    mocks.createConversation.mockResolvedValue(conversation)

    const response = await POST(request("POST"))

    expect(mocks.createConversation).toHaveBeenCalledWith(ctx)
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toEqual({ conversation })
  })

  it("rejects a cross-origin create", async () => {
    const response = await POST(request("POST", "https://evil.example"))

    expect(response.status).toBe(403)
    expect(mocks.createConversation).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/assistant/conversations/[conversationId]", () => {
  function params(conversationId: string) {
    return { params: Promise.resolve({ conversationId }) }
  }

  it("deletes the conversation", async () => {
    mocks.deleteConversation.mockResolvedValue(undefined)

    const response = await DELETE(request("DELETE"), params("conv_1"))

    expect(mocks.deleteConversation).toHaveBeenCalledWith(ctx, "conv_1")
    expect(response.status).toBe(204)
  })

  it("returns 404 for a foreign or unknown id", async () => {
    mocks.deleteConversation.mockRejectedValue(
      new NotFoundError("Conversation")
    )

    const response = await DELETE(request("DELETE"), params("conv_foreign"))

    expect(response.status).toBe(404)
  })

  it("rejects a cross-origin delete", async () => {
    const response = await DELETE(
      request("DELETE", "https://evil.example"),
      params("conv_1")
    )

    expect(response.status).toBe(403)
    expect(mocks.deleteConversation).not.toHaveBeenCalled()
  })
})
