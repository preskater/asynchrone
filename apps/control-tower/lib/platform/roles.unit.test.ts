import { describe, expect, it } from "vitest"

import {
  isPlatformAdmin,
  parsePlatformRoles,
  primaryPlatformRole,
} from "./roles"

describe("parsePlatformRoles", () => {
  it("keeps platform roles from the comma-separated field", () => {
    expect(
      parsePlatformRoles("user, platform_support ,platform_admin")
    ).toEqual(["platform_support", "platform_admin"])
  })

  it.each([
    null,
    undefined,
    "",
    "user",
    "admin",
    "PLATFORM_ADMIN",
    "platform_",
  ])("grants nothing for %s", (role) => {
    expect(parsePlatformRoles(role)).toEqual([])
    expect(primaryPlatformRole(role)).toBeNull()
  })
})

describe("primaryPlatformRole", () => {
  it("returns the first platform role", () => {
    expect(primaryPlatformRole("user,platform_admin")).toBe("platform_admin")
  })
})

describe("isPlatformAdmin", () => {
  it("is true for platform_admin only", () => {
    expect(isPlatformAdmin("platform_admin")).toBe(true)
    expect(isPlatformAdmin("platform_support")).toBe(false)
  })
})
