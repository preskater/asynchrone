import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AuthHomeButton } from "@/components/auth-home-button"
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow"

import { auth } from "@/lib/auth"
import { getPortalContext } from "@/lib/portal/context"
import { prisma } from "@/lib/prisma"

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string; subscribe?: string }>
}) {
  const { create, subscribe } = await searchParams
  // Came from a "Get Team" click: keep the intent so checkout starts right
  // after the workspace exists.
  const interval = subscribe === "year" ? "year" : subscribe === "month" ? "month" : null

  const session = await auth.api.getSession({ headers: await headers() })

  if (!session) {
    redirect("/sign-in")
  }

  // Client-portal users belong in their portal, not the onboarding flow.
  if (await getPortalContext()) {
    redirect("/portal")
  }

  const organizations = await auth.api.listOrganizations({
    headers: await headers(),
  })

  if (organizations.length > 0 && create !== "1") {
    const sessionOrganizationId = session.session.activeOrganizationId ?? null
    const active =
      organizations.find((org) => org.id === sessionOrganizationId) ??
      organizations[0]
    if (active) {
      redirect(`/${active.slug}`)
    }
  }

  const invitations = await prisma.invitation.findMany({
    where: {
      email: { equals: session.user.email, mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    include: { organization: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  })

  const pendingInvitations = invitations.map((invitation) => ({
    id: invitation.id,
    organizationName: invitation.organization.name,
    organizationSlug: invitation.organization.slug,
    role: invitation.role,
  }))

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="absolute start-6 top-6">
        <AuthHomeButton />
      </div>
      <div className="w-full max-w-lg">
        <OnboardingFlow
          userName={session.user.name}
          invitations={pendingInvitations}
          subscribeInterval={interval}
        />
      </div>
    </div>
  )
}
