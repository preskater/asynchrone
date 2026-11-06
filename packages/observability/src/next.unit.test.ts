import { NextRequest, NextResponse } from "next/server"
import { describe, expect, it } from "vitest"

import { CORRELATION_COOKIE } from "./correlation"
import { withCorrelation } from "./next"

function correlate(headers: Record<string, string> = {}) {
  const request = new NextRequest("http://localhost/en/acme", { headers })
  return withCorrelation(request, NextResponse.next())
}

describe("withCorrelation", () => {
  it("keeps the correlation id in a cookie on page requests", () => {
    expect(correlate().cookies.get(CORRELATION_COOKIE)).toBeDefined()
  })

  it("sets no cookie on a server action, which would refresh the route", () => {
    const response = correlate({ "next-action": "abc" })

    expect(response.cookies.get(CORRELATION_COOKIE)).toBeUndefined()
  })
})
