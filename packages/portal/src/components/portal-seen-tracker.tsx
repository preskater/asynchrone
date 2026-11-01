"use client"

import * as React from "react"

import { usePortalActions } from "./actions"

/**
 * Marks the portal visit as seen once the page has painted, so unread badges
 * stay visible for the whole visit and clear on the next one.
 */
export function PortalSeenTracker() {
  const actions = usePortalActions()

  React.useEffect(() => {
    void actions.markPortalSeenAction()
  }, [actions])

  return null
}
