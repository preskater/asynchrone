import { redirect } from "next/navigation"

import { readSessionRecord } from "@/lib/auth/session"
import { identity } from "@/lib/identity"

/**
 * Locale root: send a signed-in member to the calendar of their active
 * organization, everyone else to the sign-in handoff.
 */
export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const session = await readSessionRecord()

  if (!session) redirect(`/${locale}/sign-in`)

  const organization = await identity
    .getOrganization(session.organizationId)
    .catch(() => null)

  redirect(
    organization ? `/${locale}/${organization.slug}` : `/${locale}/sign-in`
  )
}
