"use client"

import * as React from "react"
import {
  entitlementsFor,
  hasEntitlement,
  type Entitlement,
  type Entitlements,
} from "@workspace/db/plans"

const EntitlementsContext = React.createContext<Entitlements>(
  entitlementsFor("free")
)

export function EntitlementsProvider({
  entitlements,
  children,
}: {
  entitlements: Entitlements
  children: React.ReactNode
}) {
  return (
    <EntitlementsContext.Provider value={entitlements}>
      {children}
    </EntitlementsContext.Provider>
  )
}

/** UI hint only; the server-side check in `entitlements.ts` is authoritative. */
export function useEntitlements() {
  const entitlements = React.useContext(EntitlementsContext)
  return {
    entitlements,
    can: (entitlement: Entitlement) =>
      hasEntitlement(entitlements, entitlement),
  }
}
