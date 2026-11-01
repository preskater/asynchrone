import { createAccessControl } from "better-auth/plugins/access"

export const statements = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
} as const

export const ac = createAccessControl(statements)

export const owner = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
})

export const admin = ac.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
})

export const member = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
})

export const viewer = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: ["read"],
})

/// Read-only client-portal accounts. They hold no organization permissions;
/// their data scope (one company, its projects and shared documents) is
/// enforced by the portal routes, not by the access-control statements.
export const client = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
  team: [],
  ac: [],
})

export const orgRoles = { owner, admin, member, viewer, client }
