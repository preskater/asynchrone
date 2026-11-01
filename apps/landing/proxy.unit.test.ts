import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"

import proxy from "./proxy"
import { workspaceUrl } from "./lib/workspace"

function request(path: string) {
  return new NextRequest(new URL(path, "https://asynchrone.space"))
}

describe("landing proxy", () => {
  it("redirects a legacy apex workspace path to Copilot", () => {
    const response = proxy(request("/fr/sign-in?redirect=%2Fportal"))

    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe(
      `${workspaceUrl}/fr/sign-in?redirect=%2Fportal`
    )
  })

  it("redirects an organization-scoped workspace path", () => {
    const response = proxy(request("/acme/settings/account"))

    expect(response.status).toBe(308)
    expect(response.headers.get("location")).toBe(
      `${workspaceUrl}/acme/settings/account`
    )
  })

  it("does not set any cookie, not even a locale cookie", () => {
    for (const path of ["/sign-in", "/en", "/en/pricing", "/blog/search"]) {
      expect(proxy(request(path)).headers.get("set-cookie")).toBeNull()
    }
  })

  it("leaves marketing pages to next-intl", () => {
    const response = proxy(request("/en/pricing"))

    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
  })
})
