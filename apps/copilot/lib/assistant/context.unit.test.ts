import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getRequestContext: vi.fn(),
  getRequestContextForOrganization: vi.fn(),
}))

vi.mock("@/lib/core/auth-context", () => ({
  getRequestContext: mocks.getRequestContext,
  getRequestContextForOrganization: mocks.getRequestContextForOrganization,
}))

import { ASSISTANT_ORGANIZATION_HEADER } from "@workspace/ai/conversations"

import { assistantRequestContext } from "./context"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("assistantRequestContext", () => {
  it("falls back to the active organization when no header is sent", async () => {
    const ctx = { organizationId: "org_active" }
    mocks.getRequestContext.mockResolvedValue(ctx)

    await expect(
      assistantRequestContext(
        new Request("http://localhost:3000/api/assistant")
      )
    ).resolves.toBe(ctx)
    expect(mocks.getRequestContextForOrganization).not.toHaveBeenCalled()
  })

  it("resolves the organization in the header through the membership check", async () => {
    const ctx = { organizationId: "org_url" }
    mocks.getRequestContextForOrganization.mockResolvedValue(ctx)

    await expect(
      assistantRequestContext(
        new Request("http://localhost:3000/api/assistant", {
          headers: { [ASSISTANT_ORGANIZATION_HEADER]: "org_url" },
        })
      )
    ).resolves.toBe(ctx)
    expect(mocks.getRequestContextForOrganization).toHaveBeenCalledWith(
      "org_url"
    )
    expect(mocks.getRequestContext).not.toHaveBeenCalled()
  })

  it("rejects an organization the user is not a member of", async () => {
    mocks.getRequestContextForOrganization.mockRejectedValue(
      new Error("forbidden")
    )

    await expect(
      assistantRequestContext(
        new Request("http://localhost:3000/api/assistant", {
          headers: { [ASSISTANT_ORGANIZATION_HEADER]: "org_foreign" },
        })
      )
    ).rejects.toThrow("forbidden")
  })
})
