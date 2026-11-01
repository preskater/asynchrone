import { CircleHelpIcon, MessageSquareHeartIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { DashboardEmpty } from "@/components/dashboard-empty"
import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"

export default async function HelpPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
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
            render={<Link href={`/${orgSlug}/feedback`} />}
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
