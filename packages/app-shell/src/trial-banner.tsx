import { getTranslations } from "next-intl/server"

import { Link } from "@workspace/i18n/navigation"
import { buttonVariants } from "@workspace/ui/components/button"

/** Shown across the workspace while a Team trial is running. */
export async function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const t = await getTranslations("Trial")

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/5 px-4 py-2 text-sm">
      <p>
        <span className="font-medium">
          {t("bannerActive", { days: daysLeft })}
        </span>{" "}
        <span className="text-muted-foreground">{t("bannerDescription")}</span>
      </p>
      <Link
        href="/pricing"
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        {t("choosePlan")}
      </Link>
    </div>
  )
}
