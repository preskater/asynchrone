import { routing } from "@workspace/i18n/routing"

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
 * Top-level paths that lived on the apex before the Copilot split (#175).
 * They stay here only as redirects: the landing owns `asynchrone.space`, but
 * old bookmarks and links must not 404. Keep this list to Copilot-only
 * surfaces — marketing pages must never be swallowed by it.
 */
export const LEGACY_COPILOT_PATHS = new Set([
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
  "settings",
  "search",
  "help",
  "feedback",
  // MCP is a POST-only endpoint; a 308 keeps the method and body.
  "mcp",
])

/**
 * Two-segment Copilot-only paths. `api/assistant` is the only API the old
 * apex exposed to the browser; every other `/api/*` route stays internal to
 * Copilot and never had a public URL here.
 */
export const LEGACY_COPILOT_PREFIXES = ["api/assistant"]

/**
 * First path segments owned by the marketing site. Used to decide whether an
 * unfamiliar path is a Copilot organization slug or a marketing page: the
 * landing must never shadow its own pages, including future ones.
 */
export const MARKETING_SEGMENTS = new Set([
  "about",
  "blog",
  "careers",
  "contact",
  "faq",
  "features",
  "legal",
  "pricing",
])

/**
 * Workspace sections that only exist behind a Copilot organization slug
 * (`/<orgSlug>/settings`, `/<orgSlug>/search`, …). A path whose second
 * segment is one of these was an apex workspace URL before the split, so it
 * redirects with the slug intact. Marketing first segments are handled above.
 */
export const WORKSPACE_SECTIONS = new Set([
  "settings",
  "search",
  "help",
  "feedback",
  "projects",
  "files",
  "messages",
  "calendars",
  "employees",
  "clients",
  "hr",
])

const LOCALES = new Set<string>(routing.locales)

function stripLocale(segments: string[]) {
  return segments[0] && LOCALES.has(segments[0]) ? segments.slice(1) : segments
}

/**
 * The Copilot destination for a legacy apex path, or `null` when the path
 * belongs to the landing.
 *
 * The locale prefix is preserved (`/fr/sign-in` → `copilot…/fr/sign-in`) and
 * the query string is carried over, so verification links, invitation tokens
 * and `?redirect=` intents keep working after the redirect.
 */
export function legacyCopilotTarget(
  pathname: string,
  search = ""
): string | null {
  const segments = stripLocale(pathname.split("/").filter(Boolean))
  const [first, second] = segments
  if (!first) return null

  const suffix = `${pathname}${search}`

  if (LEGACY_COPILOT_PATHS.has(first)) return suffix
  if (LEGACY_COPILOT_PREFIXES.some((prefix) => `${first}/${second}` === prefix))
    return suffix

  // The first segment is a marketing page (or a marketing asset); never
  // redirect it, even when the second segment looks like a workspace section.
  if (MARKETING_SEGMENTS.has(first)) return null

  if (segments.length >= 2 && WORKSPACE_SECTIONS.has(second!)) return suffix

  return null
}

/**
 * Checkout needs a session and a workspace. Carry the `subscribe` intent
 * through sign-up and onboarding, then start the payment from settings.
 */
export function subscribeHref(interval: "month" | "year") {
  const target = `/onboarding?subscribe=${interval}`
  return `${signUpHref}?redirect=${encodeURIComponent(target)}`
}
