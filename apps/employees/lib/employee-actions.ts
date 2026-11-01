import type { EmployeeActions } from "@workspace/employees/components/actions"

import * as employeeActions from "@/actions/employees"

/**
 * The app's server actions, bound to the port `@workspace/employees` expects.
 *
 * Package components reach them through `useEmployeeActions()`; no component
 * imports `@/actions/*`.
 */
export const EMPLOYEE_ACTIONS: EmployeeActions = { ...employeeActions }
