"use client"

import { PortalHeader as PortalHeaderView } from "@workspace/portal/components/portal-header"

import { authClient } from "@/lib/auth-client"

/**
 * Copilot's binding of the portal header: the package renders it, the app
 * supplies the Better Auth client used to sign out.
 */
export function PortalHeader(
  props: Omit<React.ComponentProps<typeof PortalHeaderView>, "onSignOut">
) {
  return (
    <PortalHeaderView
      {...props}
      onSignOut={async () => {
        await authClient.signOut()
      }}
    />
  )
}
