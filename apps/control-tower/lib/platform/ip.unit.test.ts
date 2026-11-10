import { describe, expect, it } from "vitest"

import { isIpAllowed } from "./ip"

describe("isIpAllowed", () => {
  it.each([undefined, "", " , "])("allows everything for list %j", (list) => {
    expect(isIpAllowed("203.0.113.9", list)).toBe(true)
    expect(isIpAllowed(null, list)).toBe(true)
  })

  it("rejects an unknown address once a list is set", () => {
    expect(isIpAllowed(null, "203.0.113.9")).toBe(false)
    expect(isIpAllowed(null, "*")).toBe(false)
  })

  it("matches exact addresses, wildcards and IPv4-mapped IPv6", () => {
    expect(isIpAllowed("203.0.113.9", "10.0.0.1, 203.0.113.9")).toBe(true)
    expect(isIpAllowed("203.0.113.10", "10.0.0.1, 203.0.113.9")).toBe(false)
    expect(isIpAllowed("198.51.100.1", "*")).toBe(true)
    expect(isIpAllowed("::ffff:203.0.113.9", "203.0.113.9")).toBe(true)
    expect(isIpAllowed("2001:db8::1", "2001:db8::1")).toBe(true)
  })

  it("matches CIDR blocks on their boundaries", () => {
    expect(isIpAllowed("203.0.113.0", "203.0.113.0/24")).toBe(true)
    expect(isIpAllowed("203.0.113.255", "203.0.113.0/24")).toBe(true)
    expect(isIpAllowed("203.0.114.0", "203.0.113.0/24")).toBe(false)
    expect(isIpAllowed("203.0.113.9", "203.0.113.9/32")).toBe(true)
    expect(isIpAllowed("203.0.113.10", "203.0.113.9/32")).toBe(false)
    expect(isIpAllowed("255.1.2.3", "0.0.0.0/0")).toBe(true)
  })

  it.each([
    "10.0.0.0/",
    "10.0.0.0/8/9",
    "10..0.0/8",
    "0x0a.0.0.0/8",
    "10.0.0.0/33",
    "10.0.0.0/-1",
    "10.0.0.0/abc",
    "10.0.0.0/1.5",
    "/8",
    "10.0.0/8",
    "10.0.0.256/8",
  ])("fails closed on the malformed entry %s", (entry) => {
    expect(isIpAllowed("10.0.0.1", entry)).toBe(false)
  })

  it("never matches a non-IPv4 address against a CIDR block", () => {
    expect(isIpAllowed("2001:db8::1", "0.0.0.0/0")).toBe(false)
    expect(isIpAllowed("not-an-ip", "0.0.0.0/0")).toBe(false)
  })
})
