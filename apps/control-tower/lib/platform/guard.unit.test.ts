import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  headers: vi.fn(),
}))

vi.mock("next/headers", () => ({ headers: mocks.headers }))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND")
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
}))
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: mocks.getSession } },
}))

import {
  getPlatformContext,
  PlatformForbiddenError,
  PlatformUnauthorizedError,
  requirePlatformContext,
  requirePlatformSession,
} from "./guard"

function session(role: string | null, twoFactorEnabled = true) {
  return {
    user: {
      id: "user_1",
      name: "Op",
      email: "op@example.com",
      role,
      twoFactorEnabled,
    },
    session: { id: "session_1" },
  }
}

beforeEach(() => {
  mocks.getSession.mockReset()
  mocks.headers.mockResolvedValue(new Headers())
  vi.stubEnv("PLATFORM_ALLOWED_IPS", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("requirePlatformSession", () => {
  it("sends anonymous pages to sign-in and rejects anonymous actions", async () => {
    mocks.getSession.mockResolvedValue(null)
    await expect(requirePlatformSession()).rejects.toThrow("REDIRECT:/sign-in")
    await expect(
      requirePlatformSession({ surface: "action" })
    ).rejects.toBeInstanceOf(PlatformUnauthorizedError)
  })

  it("hides the app from accounts without a platform role", async () => {
    mocks.getSession.mockResolvedValue(session("user"))
    await expect(requirePlatformSession()).rejects.toThrow("NOT_FOUND")
    await expect(
      requirePlatformSession({ surface: "action" })
    ).rejects.toBeInstanceOf(PlatformForbiddenError)
  })

  it("lets an unenrolled operator reach the 2FA setup page", async () => {
    mocks.getSession.mockResolvedValue(session("platform_support", false))
    await expect(requirePlatformSession()).resolves.toMatchObject({
      userId: "user_1",
      role: "platform_support",
      sessionId: "session_1",
      twoFactorEnabled: false,
    })
  })
})

describe("requirePlatformContext", () => {
  it("returns the context of an enrolled operator", async () => {
    mocks.getSession.mockResolvedValue(session("platform_admin"))
    await expect(requirePlatformContext()).resolves.toMatchObject({
      role: "platform_admin",
    })
  })

  it("requires TOTP enrollment for every platform role", async () => {
    mocks.getSession.mockResolvedValue(session("platform_admin", false))
    await expect(requirePlatformContext()).rejects.toThrow(
      "REDIRECT:/setup-2fa"
    )
    await expect(
      requirePlatformContext({ surface: "action" })
    ).rejects.toBeInstanceOf(PlatformForbiddenError)
  })

  it("honours allowUnverifiedTwoFactor", async () => {
    mocks.getSession.mockResolvedValue(session("platform_admin", false))
    await expect(
      requirePlatformContext({ allowUnverifiedTwoFactor: true })
    ).resolves.toMatchObject({ twoFactorEnabled: false })
  })
})

describe("network allowlist", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_ALLOWED_IPS", "203.0.113.0/24")
    mocks.getSession.mockResolvedValue(session("platform_admin"))
  })

  it("accepts an allowed x-forwarded-for or x-real-ip address", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ "x-forwarded-for": "203.0.113.9" })
    )
    await expect(requirePlatformContext()).resolves.toBeTruthy()

    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "203.0.113.9" }))
    await expect(requirePlatformContext()).resolves.toBeTruthy()
  })

  it("rejects other networks before reading the session", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ "x-forwarded-for": "198.51.100.1" })
    )
    await expect(requirePlatformContext()).rejects.toThrow("NOT_FOUND")
    await expect(
      requirePlatformContext({ surface: "action" })
    ).rejects.toBeInstanceOf(PlatformForbiddenError)
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it("ignores a forged left-most x-forwarded-for entry", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.1" })
    )
    await expect(requirePlatformContext()).rejects.toThrow("NOT_FOUND")
  })

  it("prefers x-real-ip over x-forwarded-for", async () => {
    mocks.headers.mockResolvedValue(
      new Headers({
        "x-real-ip": "198.51.100.1",
        "x-forwarded-for": "203.0.113.9",
      })
    )
    await expect(requirePlatformContext()).rejects.toThrow("NOT_FOUND")
  })

  it("reads only the headers in TRUSTED_IP_HEADERS", async () => {
    vi.stubEnv("TRUSTED_IP_HEADERS", "x-forwarded-for")
    mocks.headers.mockResolvedValue(new Headers({ "x-real-ip": "203.0.113.9" }))
    await expect(requirePlatformContext()).rejects.toThrow("NOT_FOUND")
  })

  it("rejects a request with no address", async () => {
    await expect(requirePlatformContext()).rejects.toThrow("NOT_FOUND")
  })
})

describe("getPlatformContext", () => {
  it("is null for anonymous and non-platform users", async () => {
    mocks.getSession.mockResolvedValue(null)
    await expect(getPlatformContext()).resolves.toBeNull()
    mocks.getSession.mockResolvedValue(session("user"))
    await expect(getPlatformContext()).resolves.toBeNull()
  })

  it("returns the operator context", async () => {
    mocks.getSession.mockResolvedValue(session("platform_support"))
    await expect(getPlatformContext()).resolves.toMatchObject({
      role: "platform_support",
    })
  })
})
