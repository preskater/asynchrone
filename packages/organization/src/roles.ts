export type OrgRole = "owner" | "admin" | "member" | "viewer" | "client"

export const ROLE_RANK: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
  client: 0,
}

export interface RoleMeta {
  value: OrgRole
  badge: "default" | "secondary" | "outline"
}

export const ORG_ROLES: RoleMeta[] = [
  { value: "owner", badge: "default" },
  { value: "admin", badge: "default" },
  { value: "member", badge: "secondary" },
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

export function roleRank(role: string | null | undefined): number {
  const primary = (role ?? "").split(",")[0]?.trim()
  return primary ? (ROLE_RANK[primary as OrgRole] ?? 0) : 0
}

export function parseRoles(role: string | null | undefined): OrgRole[] {
  const roles = (role ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  return roles.length > 0 ? (roles as OrgRole[]) : ["member"]
}
