import type { OrgRole } from "./roles"

/** The member directory shape shared by the shell and every domain app. */
export interface MemberDirectoryEntry {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: OrgRole
}

export interface MemberDirectorySource {
  userId: string
  role: string
  user: {
    name: string
    email: string
    image: string | null
  }
}

const ROLES: OrgRole[] = ["owner", "admin", "member", "viewer", "client"]

function toMemberRole(role: string | null | undefined): OrgRole {
  return ROLES.includes(role as OrgRole) ? (role as OrgRole) : "member"
}

/** Map a joined member row to the transport-safe directory entry. */
export function toMemberDirectoryEntry(
  source: MemberDirectorySource
): MemberDirectoryEntry {
  return {
    id: source.userId,
    name: source.user.name,
    email: source.user.email,
    avatarUrl: source.user.image ?? undefined,
    role: toMemberRole(source.role),
  }
}
