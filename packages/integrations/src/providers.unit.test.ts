import { afterEach, describe, expect, it, vi } from "vitest"

import { decryptSecret, encryptSecret, generateWebhookSecret } from "./crypto"
import { githubApiBase, gitlabApiBase } from "./providers"

const SECRET = "0123456789abcdef0123456789abcdef"

afterEach(() => vi.unstubAllEnvs())

describe("provider API bases", () => {
  it("defaults to the cloud APIs", () => {
    expect(githubApiBase(null)).toBe("https://api.github.com")
    expect(gitlabApiBase(null)).toBe("https://gitlab.com/api/v4")
  })

  it("normalises self-managed instance URLs", () => {
    expect(githubApiBase("https://ghe.example.com/")).toBe(
      "https://ghe.example.com/api/v3"
    )
    expect(githubApiBase("https://ghe.example.com/api/v3/")).toBe(
      "https://ghe.example.com/api/v3"
    )
    expect(gitlabApiBase("https://gitlab.example.com/")).toBe(
      "https://gitlab.example.com/api/v4"
    )
    expect(gitlabApiBase("https://gitlab.example.com/api/v4")).toBe(
      "https://gitlab.example.com/api/v4"
    )
  })
})

describe("repository token cipher", () => {
  it("round-trips a token", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET)
    const encrypted = encryptSecret("ghp_secret")
    expect(encrypted).toMatch(/^v1:[^:]+:[^:]+:[^:]+$/)
    expect(encrypted).not.toContain("ghp_secret")
    expect(decryptSecret(encrypted)).toBe("ghp_secret")
  })

  it("cannot decrypt with a different secret", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET)
    const encrypted = encryptSecret("ghp_secret")
    vi.stubEnv("BETTER_AUTH_SECRET", "abcdef0123456789abcdef0123456789")
    expect(() => decryptSecret(encrypted)).toThrow()
  })

  it("generates a distinct webhook secret", () => {
    const first = generateWebhookSecret()
    const second = generateWebhookSecret()
    expect(first).not.toBe(second)
    expect(first.length).toBeGreaterThan(20)
  })
})
