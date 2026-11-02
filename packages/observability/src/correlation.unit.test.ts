import { describe, expect, it } from "vitest"

import {
  CORRELATION_COOKIE,
  CORRELATION_HEADER,
  CORRELATION_QUERY_PARAM,
  correlateUrl,
  correlationHeaders,
  isCorrelationId,
  readCorrelationCookie,
  resolveCorrelationId,
} from "./correlation"

const ID = "11111111-1111-4111-8111-111111111111"

describe("correlation ids", () => {
  it("accepts a conservative id and rejects injection", () => {
    expect(isCorrelationId(ID)).toBe(true)
    expect(isCorrelationId("abc")).toBe(false)
    expect(isCorrelationId("<script>alert(1)</script>")).toBe(false)
    expect(isCorrelationId("a".repeat(129))).toBe(false)
    expect(isCorrelationId(undefined)).toBe(false)
  })

  it("prefers the header, then the query, then the cookie", () => {
    expect(
      resolveCorrelationId({
        header: ID,
        query: "22222222-2222-4222-8222-222222222222",
        cookie: "33333333-3333-4333-8333-333333333333",
      })
    ).toBe(ID)
    expect(
      resolveCorrelationId({
        query: ID,
        cookie: "33333333-3333-4333-8333-333333333333",
      })
    ).toBe(ID)
    expect(resolveCorrelationId({ cookie: ID })).toBe(ID)
  })

  it("generates an id when nothing valid is present", () => {
    const generated = resolveCorrelationId({ header: "not valid" })
    expect(isCorrelationId(generated)).toBe(true)
    expect(generated).not.toBe("not valid")
  })

  it("carries the id on a cross-app URL without losing the query", () => {
    expect(correlateUrl("https://projects.example/x?tab=1#top", ID)).toBe(
      `https://projects.example/x?tab=1&${CORRELATION_QUERY_PARAM}=${ID}#top`
    )
    expect(correlateUrl("/en/acme/projects", ID)).toBe(
      `/en/acme/projects?${CORRELATION_QUERY_PARAM}=${ID}`
    )
    // Idempotent.
    expect(
      correlateUrl(`https://x.example/?${CORRELATION_QUERY_PARAM}=${ID}`, ID)
    ).toBe(`https://x.example/?${CORRELATION_QUERY_PARAM}=${ID}`)
  })

  it("reads the cookie and renders the response header", () => {
    expect(readCorrelationCookie(`a=1; ${CORRELATION_COOKIE}=${ID}; b=2`)).toBe(
      ID
    )
    expect(readCorrelationCookie("a=1")).toBeNull()
    expect(readCorrelationCookie(null)).toBeNull()
    expect(correlationHeaders(ID)).toEqual({ [CORRELATION_HEADER]: ID })
    expect(correlationHeaders("bad")).toEqual({})
  })
})
