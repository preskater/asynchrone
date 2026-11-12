import { describe, expect, it } from "vitest"

import {
  apiTokenMatches,
  apiTokenPrefix,
  bearerToken,
  generateApiToken,
  hashApiToken,
} from "./token"

describe("generateApiToken", () => {
  it("produces a parseable token whose hash is stored, not the token", () => {
    const { token, prefix, tokenHash } = generateApiToken()
    expect(token).toMatch(/^asy_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/)
    expect(apiTokenPrefix(token)).toBe(prefix)
    expect(tokenHash).toBe(hashApiToken(token))
    expect(tokenHash).not.toContain(token.slice(prefix.length + 1))
  })

  it("never repeats", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateApiToken().token)
    )
    expect(tokens.size).toBe(50)
  })
})

describe("apiTokenPrefix", () => {
  it.each([
    "",
    "asy_abc",
    "psk_abcdefgh_" + "a".repeat(43),
    "asy_ABCDEFGH_" + "a".repeat(43),
    "asy_abcdefgh_" + "a".repeat(42),
    "asy_abcdefgh_" + "a".repeat(43) + " ",
  ])("rejects %j", (value) => {
    expect(apiTokenPrefix(value)).toBeNull()
  })
})

describe("apiTokenMatches", () => {
  it("accepts the right token and rejects any other", () => {
    const { token, tokenHash } = generateApiToken()
    expect(apiTokenMatches(token, tokenHash)).toBe(true)
    expect(apiTokenMatches(generateApiToken().token, tokenHash)).toBe(false)
    expect(apiTokenMatches(token, "not-hex")).toBe(false)
  })
})

describe("bearerToken", () => {
  it("reads the bearer value only", () => {
    expect(bearerToken("Bearer abc")).toBe("abc")
    expect(bearerToken("bearer abc")).toBe("abc")
    expect(bearerToken("Basic abc")).toBeNull()
    expect(bearerToken("Bearer a b")).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })
})
