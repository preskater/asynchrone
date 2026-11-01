import { describe, expect, it } from "vitest"

import { sessionAuditAction } from "./session-audit"

describe("sessionAuditAction", () => {
  it("maps each revocation endpoint", () => {
    expect(sessionAuditAction("/revoke-session")).toBe("member.session_revoked")
    expect(sessionAuditAction("/revoke-other-sessions")).toBe(
      "member.other_sessions_revoked"
    )
    expect(sessionAuditAction("/revoke-sessions")).toBe(
      "member.sessions_revoked"
    )
  })

  it("ignores other endpoints", () => {
    expect(sessionAuditAction("/list-sessions")).toBeNull()
    expect(sessionAuditAction("/sign-out")).toBeNull()
    expect(sessionAuditAction(undefined)).toBeNull()
  })
})
