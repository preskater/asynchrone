"use client"

import * as React from "react"

import type { ActionResult } from "@workspace/core/action"

/**
 * The server actions of the owning app, injected into the UI.
 *
 * Server actions stay in `apps/web` (and move with `apps/employees` later), so
 * the package components cannot import them. The app passes this object to
 * `EmployeeActionsProvider`; every component reaches it through
 * `useEmployeeActions()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EmployeeAction = (...args: any[]) => Promise<ActionResult<any>>

export interface EmployeeActions {
  fetchAttendanceAction: EmployeeAction
  fetchTrackingAction: EmployeeAction
  fetchPayrollAction: EmployeeAction
  setAttendanceAction: EmployeeAction
  clearAttendanceAction: EmployeeAction
  setDayStatusAction: EmployeeAction
  createLeaveAction: EmployeeAction
  decideLeaveAction: EmployeeAction
  cancelLeaveAction: EmployeeAction
  setAllowanceAction: EmployeeAction
  adjustBalanceAction: EmployeeAction
  updateEmployeeSettingsAction: EmployeeAction
  updateProfileAction: EmployeeAction
  updateSalaryAction: EmployeeAction
  saveClientAction: EmployeeAction
  saveActivityAction: EmployeeAction
  updateProjectEmployeeAction: EmployeeAction
  exportCsvAction: EmployeeAction
}

const EmployeeActionsContext = React.createContext<EmployeeActions | null>(null)

export function EmployeeActionsProvider({
  actions,
  children,
}: {
  actions: EmployeeActions
  children: React.ReactNode
}) {
  return (
    <EmployeeActionsContext.Provider value={actions}>
      {children}
    </EmployeeActionsContext.Provider>
  )
}

export function useEmployeeActions(): EmployeeActions {
  const context = React.useContext(EmployeeActionsContext)
  if (!context) {
    throw new Error(
      "useEmployeeActions must be used within an EmployeeActionsProvider"
    )
  }
  return context
}
