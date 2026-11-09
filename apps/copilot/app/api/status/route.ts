import { appOrigin } from "@workspace/contracts/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Stable status link for every app's help menu and footer (#101): redirects to
 * the hosted status page (`STATUS_PAGE_URL`), so only Copilot needs the URL.
 * Without one it falls back to the public support policy on the landing.
 */
export function GET(): Response {
  const target =
    process.env.STATUS_PAGE_URL || `${appOrigin("landing")}/en/support`
  return Response.redirect(target, 307)
}
