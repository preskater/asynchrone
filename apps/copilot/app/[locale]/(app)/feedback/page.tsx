import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { FeedbackForm } from "@/components/feedback/feedback-form"

import { auth } from "@/lib/auth"

/**
 * Workspace-wide feedback page (`/feedback`). Resolves the organization the
 * same way the app layout does, so it also works before the first
 * organization switch has been persisted on the session.
 */
export default async function FeedbackPage() {
  const t = await getTranslations("Feedback")
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const organizations = await auth.api.listOrganizations({
    headers: await headers(),
  })
  if (organizations.length === 0) redirect("/onboarding")

  const organization =
    organizations.find(
      (org) => org.id === session.session.activeOrganizationId
    ) ?? organizations[0]!

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
