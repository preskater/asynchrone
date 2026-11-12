import type { MemberRole } from "@workspace/contracts"

export type { MemberRole }

/**
 * Cumulative organization roles (ADR 0040).
 *
 * A member holds a set of roles, stored comma-separated in `member.role` the
 * way Better Auth's organization plugin already reads and writes it. Every
 * authorization decision asks for a capability; a member's capabilities are the
 * union of their roles' capabilities. There is no rank and no inheritance.
 *
 * Dependency-free so every app and domain package resolves the same answer.
 */

export const ORG_ROLE_VALUES = [
  "owner",
  "admin",
  "member",
  "developer",
  "viewer",
  "client",
] as const satisfies readonly MemberRole[]

export const CAPABILITIES = [
  /** Every non-portal role: open the workspace and read its data. */
  "workspace:read",
  "organization:update",
  "organization:delete",
  "organization:export",
  "member:manage",
  "audit:read",
  "audit:configure",
  "appearance:update",
  "billing:manage",
  "integration:manage",
  "project:write",
  "project:manage",
  "task:write",
  "file:write",
  /** Owner override of file ownership and restrictions. */
  "file:manage",
  "calendar:write",
  "meeting:manage",
  "message:write",
  /** Edit or delete other people's messages. */
  "message:moderate",
  "crm:write",
  "crm:manage",
  "hr:track",
  "hr:manage",
  "portal:read",
  "portal:manage",
] as const

export type Capability = (typeof CAPABILITIES)[number]

const MEMBER: Capability[] = [
  "workspace:read",
  "project:write",
  "task:write",
  "file:write",
  "calendar:write",
  "message:write",
  "crm:write",
  "hr:track",
  "portal:read",
]

const ADMIN: Capability[] = [
  ...MEMBER,
  "organization:update",
  "member:manage",
  "audit:read",
  "appearance:update",
  "billing:manage",
  "integration:manage",
  "project:manage",
  "meeting:manage",
  "message:moderate",
  "crm:manage",
  "hr:manage",
  "portal:manage",
]

export const ROLE_CAPABILITIES: Record<MemberRole, readonly Capability[]> = {
  owner: [
    ...ADMIN,
    "organization:delete",
    "organization:export",
    "audit:configure",
    "file:manage",
  ],
  admin: ADMIN,
  member: MEMBER,
  // Repository connections and the work itself, without member, billing,
  // appearance or organization administration.
  developer: [
    "workspace:read",
    "integration:manage",
    "task:write",
    "file:write",
  ],
  viewer: ["workspace:read"],
  // Portal accounts act only through the portal routes.
  client: [],
}

/** Display and sort order; the first held role is the primary one. */
const ROLE_ORDER: Record<MemberRole, number> = Object.fromEntries(
  ORG_ROLE_VALUES.map((role, index) => [role, index])
) as Record<MemberRole, number>

function isRole(value: string): value is MemberRole {
  return (ORG_ROLE_VALUES as readonly string[]).includes(value)
}

/**
 * The known roles in a stored role value (`"member,developer"`) or list,
 * deduplicated and sorted. Unknown names are dropped; an empty value is a
 * plain member, as it always was.
 */
export function parseRoles(
  value: string | readonly string[] | null | undefined
): MemberRole[] {
  const parts = (Array.isArray(value) ? value : [value ?? ""])
    .flatMap((entry: string) => entry.split(","))
    .map((entry) => entry.trim())
  const roles = [...new Set(parts.filter(isRole))].sort(compareRoles)
  return roles.length > 0 ? roles : ["member"]
}

/** Roles from a wire payload that may predate the `roles` field. */
export function rolesFrom(payload: {
  role?: string | null
  roles?: readonly MemberRole[] | null
}): MemberRole[] {
  return parseRoles(payload.roles?.length ? payload.roles : payload.role)
}

/** The wire fields for a role set: the full set plus the legacy primary role. */
export function roleFields(roles: readonly MemberRole[]) {
  return { role: primaryRole(roles), roles: [...roles] }
}

export function compareRoles(a: MemberRole, b: MemberRole) {
  return ROLE_ORDER[a] - ROLE_ORDER[b]
}

/** The role shown first (badges, sorting, legacy single-role fields). */
export function primaryRole(roles: readonly MemberRole[]): MemberRole {
  return [...roles].sort(compareRoles)[0] ?? "member"
}

export function capabilitiesOf(
  roles: readonly MemberRole[]
): ReadonlySet<Capability> {
  return new Set(roles.flatMap((role) => ROLE_CAPABILITIES[role] ?? []))
}

/** Whether the holder of these roles (or this context) has the capability. */
export function can(
  holder: { roles: readonly MemberRole[] } | readonly MemberRole[],
  capability: Capability
): boolean {
  const roles = "roles" in holder ? holder.roles : holder
  return roles.some((role) => ROLE_CAPABILITIES[role]?.includes(capability))
}

export function hasRole(
  holder: { roles: readonly MemberRole[] },
  role: MemberRole
): boolean {
  return holder.roles.includes(role)
}

export type RoleSetProblem =
  "empty" | "client_exclusive" | "multiple_roles_require_upgrade"

/**
 * Validates a role set before it is stored. A portal `client` holds no other
 * role, and holding several roles needs the `granularPermissions` entitlement.
 */
export function roleSetProblem(
  roles: readonly MemberRole[],
  { multipleRolesAllowed }: { multipleRolesAllowed: boolean }
): RoleSetProblem | null {
  if (roles.length === 0) return "empty"
  if (roles.includes("client") && roles.length > 1) return "client_exclusive"
  if (roles.length > 1 && !multipleRolesAllowed) {
    return "multiple_roles_require_upgrade"
  }
  return null
}
