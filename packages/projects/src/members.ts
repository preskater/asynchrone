import { toMemberDirectoryEntry } from "@workspace/organization/directory"
import type { MemberDirectorySource } from "@workspace/organization/directory"

import type { Member, MemberRole } from "./types"

export type MemberSource = MemberDirectorySource

/** Project members cannot be portal clients; the directory defaults to member. */
export function toMemberView(source: MemberSource): Member {
  const entry = toMemberDirectoryEntry(source)
  return {
    id: entry.id,
    name: entry.name,
    email: entry.email,
    avatarUrl: entry.avatarUrl,
    role: (entry.role === "client" ? "member" : entry.role) as MemberRole,
  }
}
