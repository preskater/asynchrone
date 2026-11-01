import { getTranslations } from "next-intl/server"
import { SearchIcon } from "lucide-react"

import { DashboardEmpty } from "@/components/dashboard-empty"

export default async function SearchPage() {
  const t = await getTranslations("AppPages")
  return (
    <div className="flex flex-1 flex-col px-4 py-4 md:py-6 lg:px-6">
      <DashboardEmpty
        icon={SearchIcon}
        title={t("searchTitle")}
        description={t("searchDescription")}
        className="flex-1 border"
      />
    </div>
  )
}
