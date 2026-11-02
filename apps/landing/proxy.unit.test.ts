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

  it("sets no locale or session cookie", () => {
    for (const path of ["/sign-in", "/en", "/en/pricing", "/blog/search"]) {
      const cookie = proxy(request(path)).headers.get("set-cookie")
      // The only cookie is the observability correlation id (issue #170): it
      // is host-only, not auth, and never a next-intl locale cookie.
      expect(cookie ?? "").not.toMatch(/NEXT_LOCALE|session|token/i)
      if (cookie) expect(cookie).toContain("asynchrone_rid=")
    }
  })

  it("echoes a correlation id on the response", () => {
    const response = proxy(request("/en/pricing"))
    expect(response.headers.get("x-request-id")).toMatch(/[A-Za-z0-9-]{8,}/)
  })

  it("leaves marketing pages to next-intl", () => {
    const response = proxy(request("/en/pricing"))

    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
  })
})
