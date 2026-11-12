import { describe, expect, it } from "vitest"

import {
  guestCan,
  guestGrantUsable,
  guestInvitationOpen,
  parseGuestCapabilities,
} from "./guests"

const now = new Date("2026-11-12T12:00:00Z")
const later = new Date("2026-12-12T12:00:00Z")
const earlier = new Date("2026-11-01T12:00:00Z")

describe("parseGuestCapabilities", () => {
  it("always keeps read access and drops unknown or workspace capabilities", () => {
    expect(
      parseGuestCapabilities("message:write,member:manage,billing:manage")
    ).toEqual(["project:read", "task:read", "message:write"])
    expect(parseGuestCapabilities(null)).toEqual(["project:read", "task:read"])
  })

  it("answers capability checks from the parsed set", () => {
    const grant = { capabilities: parseGuestCapabilities(["task:comment"]) }
    expect(guestCan(grant, "task:comment")).toBe(true)
    expect(guestCan(grant, "task:write")).toBe(false)
  })
})

describe("guestGrantUsable", () => {
  const grant = { status: "active", userId: "user_guest", expiresAt: later }

  it("lets the accepted guest in until the grant expires", () => {
    expect(guestGrantUsable(grant, "user_guest", now)).toBe(true)
  })

  it("treats an expired grant exactly like a revoked one", () => {
    expect(
      guestGrantUsable({ ...grant, expiresAt: earlier }, "user_guest", now)
    ).toBe(false)
    expect(
      guestGrantUsable({ ...grant, status: "revoked" }, "user_guest", now)
    ).toBe(false)
  })

  it("never lets anyone else, or an unaccepted invitation, in", () => {
    expect(guestGrantUsable(grant, "user_other", now)).toBe(false)
    expect(
      guestGrantUsable({ ...grant, status: "invited" }, "user_guest", now)
    ).toBe(false)
  })
})

describe("guestInvitationOpen", () => {
  it("closes once accepted, revoked or expired", () => {
    expect(
      guestInvitationOpen({ status: "invited", expiresAt: later }, now)
    ).toBe(true)
    expect(
      guestInvitationOpen({ status: "active", expiresAt: later }, now)
    ).toBe(false)
    expect(
      guestInvitationOpen({ status: "invited", expiresAt: earlier }, now)
    ).toBe(false)
  })
})
