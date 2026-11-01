import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { organizationClient, twoFactorClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

import { ac, orgRoles } from "@workspace/organization/access"

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: orgRoles,
    }),
    oauthProviderClient(),
    twoFactorClient(),
  ],
})
