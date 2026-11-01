import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"

import { AssistantHome } from "@/components/assistant/assistant-home"

import { auth } from "@/lib/auth"
import { listConversations } from "@/lib/assistant/conversations"
import { getRequestContextForOrganization } from "@/lib/core/auth-context"
import { prisma } from "@/lib/prisma"

/**
 * The organization home.
 *
 * Copilot is where sign-in lands, so this page is the assistant, not a
 * redirect to another shell. The conversation list is loaded here on the
 * server; the transcript is fetched by the client for the id it remembers.
 */
export default async function AssistantPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  })
  if (!organization) notFound()

  const ctx = await getRequestContextForOrganization(organization.id)
  const conversations = await listConversations(ctx)

  return (
    <AssistantHome
      organizationId={organization.id}
      initialConversations={conversations}
    />
  )
}
