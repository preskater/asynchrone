"use client"

import * as React from "react"

import {
  can,
  type Capability,
  type OrgRole,
} from "@workspace/organization/roles"

/**
 * Organization permissions for the calendars shell.
 *
 * A domain app has no Better Auth client, so the workspace layout resolves the
 * member's roles once and passes them down; screens ask for capabilities.
 */
const RolesContext = React.createContext<OrgRole[]>([])

export function PermissionsProvider({
  roles,
  children,
}: {
  roles: OrgRole[]
  children: React.ReactNode
}) {
  return <RolesContext.Provider value={roles}>{children}</RolesContext.Provider>
}

export function useOrgPermissions() {
  const roles = React.useContext(RolesContext)
  return {
    roles,
    isOwner: roles.includes("owner"),
    can: (capability: Capability) => can(roles, capability),
  }
}
