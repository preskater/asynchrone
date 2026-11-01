import type { ClientActions } from "@workspace/clients/components/actions"

import * as clientActions from "@/actions/clients"

/**
 * The app's server actions, bound to the port `@workspace/clients` expects.
 *
 * Package components reach them through `useClientActions()`; no component
 * imports `@/actions/*`. The three portal-access actions stay in Copilot while
 * invitations live there (#171), so the portal card renders read-only here.
 */
export const CLIENT_ACTIONS: ClientActions = { ...clientActions }
