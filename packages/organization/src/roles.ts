import type { MemberRole } from "@workspace/core/roles"

export {
  CAPABILITIES,
  ROLE_CAPABILITIES,
  can,
  capabilitiesOf,
  compareRoles,
  hasRole,
  parseRoles,
  primaryRole,
  roleFields,
  roleSetProblem,
  rolesFrom,
  type Capability,
  type RoleSetProblem,
} from "@workspace/core/roles"

export type OrgRole = MemberRole

export interface RoleMeta {
  value: OrgRole
  badge: "default" | "secondary" | "outline"
}

export const ORG_ROLES: RoleMeta[] = [
  { value: "owner", badge: "default" },
  { value: "admin", badge: "default" },
  { value: "member", badge: "secondary" },
  { value: "developer", badge: "secondary" },
  { value: "viewer", badge: "outline" },
]

export const INVITABLE_ROLES = ORG_ROLES.filter(
  (role) => role.value !== "owner"
)

export function getRoleMeta(role: string | null | undefined): RoleMeta {
  return (
    ORG_ROLES.find((item) => item.value === role) ?? {
      value: "member",
      badge: "outline",
    }
  )
}
