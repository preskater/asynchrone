import { redirect } from "next/navigation"

import { safeRedirect } from "@workspace/core/redirect"

/**
 * Sign-in entry point.
 *
 * There is no credential form on a domain app: the only way in is Copilot's
 * authorization endpoint, so this route starts the OIDC flow (`@workspace/oidc`
 * builds the URL, state and PKCE verifier).
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ returnTo?: string }>
}) {
  const { locale } = await params
  const { returnTo } = await searchParams
  const target = safeRedirect(returnTo, `/${locale}`)

  redirect(`/api/auth/sign-in?returnTo=${encodeURIComponent(target)}`)
}
