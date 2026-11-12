"use client"

import { authClient } from "@/lib/auth-client"
import {
  can,
  parseRoles,
  primaryRole,
  type Capability,
} from "@workspace/organization/roles"

/**
 * The active member's capabilities: the union of every role they hold. UI hint
 * only; each server action and service re-checks the same capability.
 */
export function useOrgPermissions() {
  const { data: activeMember } = authClient.useActiveMember()
  const roles = activeMember ? parseRoles(activeMember.role) : []
  const has = (capability: Capability) => can(roles, capability)

  return {
    roles,
    primaryRole: roles.length > 0 ? primaryRole(roles) : null,
    isOwner: roles.includes("owner"),
    can: has,
    canUpdateOrganization: has("organization:update"),
    canManageMembers: has("member:manage"),
    canInviteMember: has("member:manage"),
    canUpdateMember: has("member:manage"),
    canDeleteMember: has("member:manage"),
    canCancelInvitation: has("member:manage"),
  }
}
