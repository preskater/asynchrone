import * as clientActions from "@/actions/clients"
import * as portalActions from "@/actions/portal"
import {
  ClientActionsProvider,
  type ClientActions,
} from "@workspace/clients/components/actions"
import { ClientsTabs } from "@workspace/clients/components/clients-tabs"

/**
 * Server actions stay in the app until `apps/clients` exists (#163); the
 * package receives them as a port so no client component imports
 * `@/actions/*`.
 */
const CLIENT_ACTIONS: ClientActions = {
  ...clientActions,
  invitePortalUserAction: portalActions.invitePortalUserAction,
  revokePortalMemberAction: portalActions.revokePortalMemberAction,
  cancelPortalInviteAction: portalActions.cancelPortalInviteAction,
}

export default async function ClientLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}>) {
  const { orgSlug } = await params

  return (
    <ClientActionsProvider actions={CLIENT_ACTIONS}>
      <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
        <ClientsTabs orgSlug={orgSlug} />
        {children}
      </div>
    </ClientActionsProvider>
  )
}
