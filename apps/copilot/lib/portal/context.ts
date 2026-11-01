/**
 * The app-side portal session, re-exported where the portal routes and actions
 * expect it. The context shape and its authorization rules live in
 * `@workspace/portal`; this module only binds Copilot's Better Auth session.
 */
export { getPortalContext, isPortalMember } from "@/lib/core/auth-context"
export type { PortalContext } from "@workspace/portal/types"
export {
  isPortalContext,
  requirePortalContext,
} from "@workspace/portal/context"
