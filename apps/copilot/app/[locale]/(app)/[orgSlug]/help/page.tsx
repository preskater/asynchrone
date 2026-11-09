import { HelpCenter } from "@/components/help/help-center"

export default async function HelpPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  return <HelpCenter feedbackHref={`/${orgSlug}/feedback`} />
}
