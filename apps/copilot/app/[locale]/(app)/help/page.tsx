import { CircleHelpIcon, MessageSquareHeartIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { DashboardEmpty } from "@/components/dashboard-empty"
import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"

/**
 * Workspace-wide help page (`/help`). The landing redirects the old apex
 * `/help` here; organization-scoped help lives at `/<orgSlug>/help`.
 */
export default async function HelpPage() {
  const t = await getTranslations("AppPages")
  const tFeedback = await getTranslations("Feedback")

  return (
    <div className="flex flex-1 flex-col px-4 py-4 md:py-6 lg:px-6">
      <DashboardEmpty
        icon={CircleHelpIcon}
        title={t("helpTitle")}
        description={t("helpDescription")}
        action={
          <Button
            variant="outline"
            render={<Link href="/feedback" />}
            nativeButton={false}
          >
            <MessageSquareHeartIcon />
            {tFeedback("navLabel")}
          </Button>
        }
        className="flex-1 border"
      />
    </div>
  )
}
