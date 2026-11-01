import { getFormatter, getTranslations } from "next-intl/server"

import { Link } from "@workspace/i18n/navigation"
import { buttonVariants } from "@workspace/ui/components/button"

/** Shown to every member while the organization is scheduled for deletion. */
export async function DeletionBanner({
  scheduledAt,
  orgSlug,
}: {
  scheduledAt: Date
  orgSlug: string
}) {
  const t = await getTranslations("Org")
  const format = await getFormatter()

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm"
    >
      <p>
        <span className="font-medium">
          {t("deletionBanner", {
            date: format.dateTime(scheduledAt, { dateStyle: "long" }),
          })}
        </span>{" "}
        <span className="text-muted-foreground">
          {t("deletionBannerDescription")}
        </span>
      </p>
      <Link
        href={`/${orgSlug}/settings`}
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        {t("deletionBannerAction")}
      </Link>
    </div>
  )
}
