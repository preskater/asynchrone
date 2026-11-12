import { notFound, redirect } from "next/navigation"

import { isAppError } from "@workspace/core/errors"
import {
  PortalActionsProvider,
  type PortalActions,
} from "@workspace/portal/components/actions"

import {
  guestUnsupportedAction,
  postGuestMessageAction,
  postGuestTaskCommentAction,
} from "@/actions/guests"
import { GuestBanner } from "@/components/guests/guest-controls"
import { requireGuestContext } from "@/lib/guests/session"

/**
 * One shared project. The grant is re-resolved on every request, so a revoked
 * or expired grant is a 404 on the next navigation.
 */
export default async function GuestProjectLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ grantId: string }>
}>) {
  const { grantId } = await params
  let ctx
  try {
    ctx = await requireGuestContext(grantId)
  } catch (error) {
    if (isAppError(error) && error.code === "unauthorized") {
      redirect(`/sign-in?redirect=${encodeURIComponent(`/guest/${grantId}`)}`)
    }
    notFound()
  }

  // The portal thread and comment components, bound to this grant.
  const actions: PortalActions = {
    postPortalMessageAction: postGuestMessageAction.bind(null, grantId),
    postPortalTaskCommentAction: postGuestTaskCommentAction.bind(null, grantId),
    markPortalSeenAction: guestUnsupportedAction,
    createMeetingRequestAction: guestUnsupportedAction,
    cancelMeetingRequestAction: guestUnsupportedAction,
  }

  return (
    <PortalActionsProvider actions={actions}>
      <div className="flex flex-col gap-6">
        <GuestBanner
          grantId={ctx.grantId}
          organizationName={ctx.organizationName}
          projectName={ctx.projectName}
          expiresAt={ctx.expiresAt.toISOString()}
        />
        {children}
      </div>
    </PortalActionsProvider>
  )
}
