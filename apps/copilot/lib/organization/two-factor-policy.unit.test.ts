import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("@/lib/core/auth-context", () => ({ requirePermission: vi.fn() }))

import { mustEnrollTwoFactor } from "./two-factor-policy"

const base = {
  required: true,
  entitled: true,
  enrolled: false,
  impersonated: false,
}

describe("mustEnrollTwoFactor", () => {
  it("sends an unenrolled member to setup when the policy applies", () => {
    expect(mustEnrollTwoFactor(base)).toBe(true)
  })

  it("lets enrolled members through", () => {
    expect(mustEnrollTwoFactor({ ...base, enrolled: true })).toBe(false)
  })

  it("does nothing when the policy is off", () => {
    expect(mustEnrollTwoFactor({ ...base, required: false })).toBe(false)
  })

  it("stops enforcing after a downgrade to a plan without it", () => {
    expect(mustEnrollTwoFactor({ ...base, entitled: false })).toBe(false)
  })

  it("lets impersonating staff through", () => {
    expect(mustEnrollTwoFactor({ ...base, impersonated: true })).toBe(false)
  })
})
