import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { FeedbackForm } from "@/components/feedback/feedback-form"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Org-scoped feedback page (`/[orgSlug]/feedback`). The path carries the
 * organization the tester is working in; `OrganizationSync` keeps the active
 * organization aligned with it, so the report is filed under the right org.
 */
export default async function OrganizationFeedbackPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const t = await getTranslations("Feedback")

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { name: true },
  })
  if (!organization) notFound()

  return (
    <div className="flex flex-1 flex-col px-4 py-4 md:py-6 lg:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("descriptionFor", { organization: organization.name })}
          </p>
        </div>
        <FeedbackForm initialEmail={session.user.email} />
      </div>
    </div>
  )
}
