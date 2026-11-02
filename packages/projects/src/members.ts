import type { DirectoryEntry } from "@workspace/organization/directory"

import type { Member, MemberRole } from "./types"

/** Project members cannot be portal clients; the directory defaults to member. */
export function toMemberView(source: DirectoryEntry): Member {
  return {
    id: source.userId,
    name: source.name,
    email: source.email,
    avatarUrl: source.avatarUrl ?? undefined,
    role: (source.role === "client" ? "member" : source.role) as MemberRole,
  }
}
