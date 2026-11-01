import { redirect } from "next/navigation"

import { readSessionRecord } from "@/lib/auth/session"
import { prisma } from "@/lib/prisma"

/**
 * Locale root: send a signed-in member to the messages of their active
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

  const organization = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { slug: true },
  })

  redirect(
    organization ? `/${locale}/${organization.slug}` : `/${locale}/sign-in`
  )
}
