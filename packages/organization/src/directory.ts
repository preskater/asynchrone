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

/** One organization member, as the identity internal API returns it. */
export interface DirectoryEntry {
  userId: string
  name: string
  email: string
  avatarUrl?: string | null
  role: OrgRole
  clientId?: string | null
  joinedAt?: Date
}

export interface DirectoryMemberInput {
  name: string
  email: string
  role: string
}

/**
 * The member directory every domain app reads.
 *
 * Copilot binds it to the identity database; a domain app binds it to
 * `IdentityClient` (`/internal/v1/organizations/:id/members`). Project member
 * management also writes through the same port, so no domain package needs the
 * identity tables in its database.
 */
export interface MemberDirectoryPort {
  list(organizationId: string): Promise<DirectoryEntry[]>
  find(organizationId: string, userId: string): Promise<DirectoryEntry | null>
  findByEmail(
    organizationId: string,
    email: string
  ): Promise<DirectoryEntry | null>
  countOwners(organizationId: string): Promise<number>
  add(organizationId: string, input: DirectoryMemberInput): Promise<DirectoryEntry>
  updateRole(
    organizationId: string,
    userId: string,
    role: string
  ): Promise<DirectoryEntry>
  remove(organizationId: string, userId: string): Promise<{ id: string }>
}

export function toDirectoryEntry(source: {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  role: string
  clientId?: string | null
  createdAt?: Date
}): DirectoryEntry {
  return {
    userId: source.id,
    name: source.name,
    email: source.email,
    avatarUrl: source.avatarUrl ?? undefined,
    role: toMemberRole(source.role),
    clientId: source.clientId ?? null,
    joinedAt: source.createdAt,
  }
}
