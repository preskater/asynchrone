import { execSync } from "node:child_process"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  CAPABILITIES,
  can,
  parseRoles,
  primaryRole,
  roleSetProblem,
  rolesFrom,
  type Capability,
} from "./roles"

/**
 * The retired single-role ladder, kept here only as the migration oracle:
 * every capability maps to the rank (or owner-only rule) it replaced.
 */
const LEGACY_RANK = { owner: 4, admin: 3, member: 2, viewer: 1, client: 0 }
type LegacyRole = keyof typeof LEGACY_RANK
const LEGACY_CHECK: Record<Capability, (role: LegacyRole) => boolean> = {
  "workspace:read": (role) => LEGACY_RANK[role] >= 1,
  "organization:update": (role) => LEGACY_RANK[role] >= 3,
  "organization:delete": (role) => role === "owner",
  "organization:export": (role) => role === "owner",
  "member:manage": (role) => LEGACY_RANK[role] >= 3,
  "audit:read": (role) => LEGACY_RANK[role] >= 3,
  "audit:configure": (role) => role === "owner",
  "appearance:update": (role) => LEGACY_RANK[role] >= 3,
  "billing:manage": (role) => LEGACY_RANK[role] >= 3,
  "integration:manage": (role) => LEGACY_RANK[role] >= 3,
  "project:write": (role) => LEGACY_RANK[role] >= 2,
  "project:manage": (role) => LEGACY_RANK[role] >= 3,
  "task:write": (role) => LEGACY_RANK[role] >= 2,
  "file:write": (role) => LEGACY_RANK[role] >= 2,
  "file:manage": (role) => role === "owner",
  "calendar:write": (role) => LEGACY_RANK[role] >= 2,
  "meeting:manage": (role) => LEGACY_RANK[role] >= 3,
  "message:write": (role) => LEGACY_RANK[role] >= 2,
  "message:moderate": (role) => LEGACY_RANK[role] >= 3,
  "crm:write": (role) => LEGACY_RANK[role] >= 2,
  "crm:manage": (role) => LEGACY_RANK[role] >= 3,
  "hr:track": (role) => LEGACY_RANK[role] >= 2,
  "hr:manage": (role) => LEGACY_RANK[role] >= 3,
  "portal:read": (role) => LEGACY_RANK[role] >= 2,
  "portal:manage": (role) => LEGACY_RANK[role] >= 3,
}

describe("capabilities", () => {
  it("keeps every existing role's effective permissions", () => {
    for (const role of Object.keys(LEGACY_RANK) as LegacyRole[]) {
      for (const capability of CAPABILITIES) {
        expect(can([role], capability), `${role} → ${capability}`).toBe(
          LEGACY_CHECK[capability](role)
        )
      }
    }
  })

  it("gives a developer repositories and work, not administration", () => {
    for (const capability of [
      "integration:manage",
      "task:write",
      "file:write",
    ] as const) {
      expect(can(["developer"], capability)).toBe(true)
    }
    for (const capability of [
      "member:manage",
      "billing:manage",
      "organization:delete",
      "appearance:update",
      "project:write",
    ] as const) {
      expect(can(["developer"], capability)).toBe(false)
    }
  })

  it("grants the union of cumulative roles", () => {
    const roles = parseRoles("member,developer")
    expect(can({ roles }, "integration:manage")).toBe(true)
    expect(can({ roles }, "project:write")).toBe(true)
    expect(can({ roles }, "member:manage")).toBe(false)
    // Reverting to member alone removes the developer access.
    expect(can({ roles: parseRoles("member") }, "integration:manage")).toBe(
      false
    )
  })
})

describe("parseRoles", () => {
  it("reads every stored role instead of the first one", () => {
    expect(parseRoles("developer, member")).toEqual(["member", "developer"])
    expect(parseRoles(["admin", "admin"])).toEqual(["admin"])
  })

  it("defaults an empty or unknown value to member, as before", () => {
    expect(parseRoles(null)).toEqual(["member"])
    expect(parseRoles("platform_admin")).toEqual(["member"])
  })

  it("prefers the roles array over the legacy wire field", () => {
    expect(
      rolesFrom({ role: "member", roles: ["member", "developer"] })
    ).toEqual(["member", "developer"])
    expect(rolesFrom({ role: "viewer" })).toEqual(["viewer"])
    expect(primaryRole(["developer", "admin"])).toBe("admin")
  })
})

describe("roleSetProblem", () => {
  it("keeps client portal accounts exclusive", () => {
    expect(
      roleSetProblem(["client", "member"], { multipleRolesAllowed: true })
    ).toBe("client_exclusive")
  })

  it("requires the entitlement for several roles", () => {
    expect(
      roleSetProblem(["member", "developer"], { multipleRolesAllowed: false })
    ).toBe("multiple_roles_require_upgrade")
    expect(
      roleSetProblem(["member", "developer"], { multipleRolesAllowed: true })
    ).toBeNull()
    expect(
      roleSetProblem(["viewer"], { multipleRolesAllowed: false })
    ).toBeNull()
  })
})

describe("rank ladder", () => {
  it("does not come back", () => {
    const root = path.resolve(import.meta.dirname, "../../..")
    const hits = execSync(
      "git grep -nE '\\b(ROLE_RANK|roleRank)\\b' -- 'apps' 'packages' ':!**/roles.unit.test.ts' || true",
      { cwd: root, encoding: "utf8" }
    ).trim()
    expect(hits).toBe("")
  })
})
