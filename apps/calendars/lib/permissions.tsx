"use client"

import * as React from "react"

import { parseRoles } from "@workspace/organization/utils"
import { roleRank, type OrgRole } from "@workspace/organization/roles"

/**
 * Organization permissions for the calendars shell.
 *
 * Copilot read them from Better Auth's active-member helper; a domain app has
 * no Better Auth client, so the workspace layout resolves the role once and
 * passes it down. The meetings screens only need the management threshold.
 */
const RoleContext = React.createContext<OrgRole | null>(null)

export function PermissionsProvider({
  role,
  children,
}: {
  role: OrgRole
  children: React.ReactNode
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}

export function useOrgPermissions() {
  const role = React.useContext(RoleContext)
  const roles = parseRoles(role ?? undefined)

  return {
    role,
    roles,
    isOwner: roles.includes("owner"),
    canUpdateOrganization: roleRank(role ?? "viewer") >= 2,
  }
}
