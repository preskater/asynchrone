import { HelpCenter } from "@/components/help/help-center"

/**
 * Workspace-wide help page (`/help`). The landing redirects the old apex
 * `/help` here; organization-scoped help lives at `/<orgSlug>/help`.
 */
export default function HelpPage() {
  return <HelpCenter feedbackHref="/feedback" />
}
