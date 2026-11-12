"use client"

import * as React from "react"

import type { ActionResult } from "@workspace/core/action"

/**
 * The server actions of the owning app, injected into the UI.
 *
 * Server actions stay in `apps/copilot` (and move with `apps/clients` later), so
 * the package components cannot import them. The app passes this object to
 * `ClientActionsProvider`; every component reaches it through
 * `useClientActions()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClientAction = (...args: any[]) => Promise<ActionResult<any>>

export interface ClientActions {
  listClientsAction: ClientAction
  listClientContactsAction: ClientAction
  listClientDealsAction: ClientAction
  listClientActivitiesAction: ClientAction
  saveClientAction: ClientAction
  archiveClientAction: ClientAction
  restoreClientAction: ClientAction
  saveContactAction: ClientAction
  archiveContactAction: ClientAction
  restoreContactAction: ClientAction
  saveDealAction: ClientAction
  moveDealAction: ClientAction
  closeDealAction: ClientAction
  reopenDealAction: ClientAction
  archiveDealAction: ClientAction
  restoreDealAction: ClientAction
  savePipelineAction: ClientAction
  setDefaultPipelineAction: ClientAction
  deletePipelineAction: ClientAction
  saveStageAction: ClientAction
  moveStageAction: ClientAction
  deleteStageAction: ClientAction
  saveFieldDefinitionAction: ClientAction
  deleteFieldDefinitionAction: ClientAction
  createActivityAction: ClientAction
  exportClientAction: ClientAction
  importClientsAction: ClientAction
  importContactsAction: ClientAction
  linkDocumentAction: ClientAction
  unlinkDocumentAction: ClientAction
  updateDocumentVisibilityAction: ClientAction
  fetchClientFileOptionsAction: ClientAction
  linkProjectAction: ClientAction
  unlinkProjectAction: ClientAction
  fetchClientProjectOptionsAction: ClientAction
  listReleaseGroupsAction: ClientAction
  saveReleaseAction: ClientAction
  deleteReleaseAction: ClientAction
  saveFeedbackAction: ClientAction
  setFeedbackStatusAction: ClientAction
  assignFeedbackAction: ClientAction
  deleteFeedbackAction: ClientAction
  exportReleaseCsvAction: ClientAction
  /**
   * Portal access management lives in Copilot until the identity API exposes
   * invitations (#171); an app that does not own it omits the three actions and
   * renders the portal card read-only.
   */
  invitePortalUserAction?: ClientAction
  revokePortalMemberAction?: ClientAction
  cancelPortalInviteAction?: ClientAction
}

const ClientActionsContext = React.createContext<ClientActions | null>(null)

export function ClientActionsProvider({
  actions,
  children,
}: {
  actions: ClientActions
  children: React.ReactNode
}) {
  return (
    <ClientActionsContext.Provider value={actions}>
      {children}
    </ClientActionsContext.Provider>
  )
}

export function useClientActions(): ClientActions {
  const context = React.useContext(ClientActionsContext)
  if (!context) {
    throw new Error(
      "useClientActions must be used within a ClientActionsProvider"
    )
  }
  return context
}
