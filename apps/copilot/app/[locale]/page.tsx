import { redirect } from "next/navigation"

import { getActiveOrgSlug } from "@/lib/organization/paths"

/**
 * The landing app owns the marketing root now. Copilot's locale root sends a
 * signed-in member to their workspace and everyone else to sign-in.
 */
export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const slug = await getActiveOrgSlug()
  redirect(slug ? `/${locale}/${slug}` : `/${locale}/sign-in`)
}
