import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import {
  PortalActionsProvider,
  type PortalActions,
} from "@workspace/portal/components/actions"

import * as meetingActions from "@/actions/meetings"
import * as portalActions from "@/actions/portal"
import { PortalHeader } from "@/components/portal/portal-header"

import { auth } from "@/lib/auth"
import { getOrganizationAppearance } from "@/lib/appearance/service"
import { getPortalContext } from "@/lib/portal/context"

/**
 * Server actions stay in the app; the package receives them as a port so no
 * portal component imports `@/actions/*`.
 */
const PORTAL_ACTIONS: PortalActions = {
  postPortalMessageAction: portalActions.postPortalMessageAction,
  postPortalTaskCommentAction: portalActions.postPortalTaskCommentAction,
  markPortalSeenAction: portalActions.markPortalSeenAction,
  createMeetingRequestAction: meetingActions.createMeetingRequestAction,
  cancelMeetingRequestAction: meetingActions.cancelMeetingRequestAction,
}

export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/sign-in")
  }

  const ctx = await getPortalContext()

  if (!ctx) {
    // Signed in but not a portal user: send them back to the workspace.
    redirect("/onboarding")
  }

  const appearance = await getOrganizationAppearance(ctx.organizationId)

  return (
    <AppearanceProvider initialAppearance={appearance} userId={ctx.userId}>
      <PortalActionsProvider actions={PORTAL_ACTIONS}>
        <div className="flex min-h-svh flex-col bg-muted/30">
          <PortalHeader
            organizationName={ctx.organizationName}
            clientName={ctx.clientName}
            userName={ctx.userName}
          />
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">
            {children}
          </main>
        </div>
      </PortalActionsProvider>
    </AppearanceProvider>
  )
}
