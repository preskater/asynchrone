import { afterEach, describe, expect, it } from "vitest"

import { isBlockedEmailDomain, isInviteOnly } from "./signup-policy"

afterEach(() => {
  delete process.env.SIGNUP_INVITE_ONLY
})

describe("isBlockedEmailDomain", () => {
  it("blocks built-in disposable providers and their subdomains", () => {
    expect(isBlockedEmailDomain("a@mailinator.com", "")).toBe(true)
    expect(isBlockedEmailDomain("a@MX.Yopmail.com", "")).toBe(true)
    expect(isBlockedEmailDomain("a@gmail.com", "")).toBe(false)
  })

  it("adds operator-configured domains", () => {
    expect(isBlockedEmailDomain("a@spam.test", " spam.test ,other.test")).toBe(
      true
    )
    expect(isBlockedEmailDomain("a@notspam.test", "spam.test")).toBe(false)
  })
})

describe("isInviteOnly", () => {
  it("is opt-in", () => {
    expect(isInviteOnly()).toBe(false)
    process.env.SIGNUP_INVITE_ONLY = "true"
    expect(isInviteOnly()).toBe(true)
  })
})
