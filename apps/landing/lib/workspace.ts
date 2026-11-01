/**
 * Public origin of the Copilot workspace. The landing is anonymous: sign-in,
 * sign-up and "open workspace" all continue there.
 *
 * `NEXT_PUBLIC_WORKSPACE_URL` overrides the host (for a preview deployment or
 * a local `copilot` on http://localhost:3003). It is inlined at build time.
 */
function resolveWorkspaceUrl() {
  const configured = process.env.NEXT_PUBLIC_WORKSPACE_URL
  if (configured) return configured.replace(/\/$/, "")
  return process.env.NODE_ENV === "development"
    ? "http://localhost:3003"
    : "https://copilot.asynchrone.space"
}

export const workspaceUrl = resolveWorkspaceUrl()

export const signInHref = `${workspaceUrl}/sign-in`
export const signUpHref = `${workspaceUrl}/sign-up`
export const openWorkspaceHref = workspaceUrl

/**
 * Paths that lived on the apex before the Copilot split (#175). They stay here
 * only as redirects: the landing owns `asynchrone.space`, but old bookmarks and
 * links must not 404. Keep this list to Copilot-only surfaces — marketing pages
 * and content must never be swallowed by it.
 */
const LEGACY_COPILOT_PATHS = new Set([
  "sign-in",
  "sign-up",
  "forgot-password",
  "reset-password",
  "verify-email",
  "two-factor",
  "consent",
  "onboarding",
  "select-organization",
  "accept-invitation",
  "portal",
])

/** True when a path (without its locale prefix) belonged to Copilot. */
export function isLegacyCopilotPath(pathname: string): boolean {
  const firstSegment = pathname.split("/").filter(Boolean)[0]
  return firstSegment ? LEGACY_COPILOT_PATHS.has(firstSegment) : false
}

/**
 * Checkout needs a session and a workspace. Carry the `subscribe` intent
 * through sign-up and onboarding, then start the payment from settings.
 */
export function subscribeHref(interval: "month" | "year") {
  const target = `/onboarding?subscribe=${interval}`
  return `${signUpHref}?redirect=${encodeURIComponent(target)}`
}
