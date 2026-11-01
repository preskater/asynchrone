"use client"

import { authClient } from "@/lib/auth-client"
import { parseRoles } from "@workspace/organization/utils"

type OrgPermissions = {
  organization?: ("update" | "delete")[]
  member?: ("create" | "update" | "delete")[]
  invitation?: ("create" | "cancel")[]
  team?: ("create" | "update" | "delete")[]
  ac?: ("create" | "read" | "update" | "delete")[]
}

export function useOrgPermissions() {
  const { data: activeMember } = authClient.useActiveMember()
  const role = activeMember?.role ?? null
  const roles = parseRoles(role)

  function can(permissions: OrgPermissions) {
    if (!role) return false
    return authClient.organization.checkRolePermission({
      role: role as "owner" | "admin" | "member" | "viewer",
      permissions,
    })
  }

  return {
    role,
    roles,
    isOwner: roles.includes("owner"),
    canUpdateOrganization: can({ organization: ["update"] }),
    canDeleteOrganization: can({ organization: ["delete"] }),
    canCreateMember: can({ member: ["create"] }),
    canUpdateMember: can({ member: ["update"] }),
    canDeleteMember: can({ member: ["delete"] }),
    canInviteMember: can({ invitation: ["create"] }),
    canCancelInvitation: can({ invitation: ["cancel"] }),
  }
}
