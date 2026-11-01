import { getFormatter, getTranslations } from "next-intl/server"

import { StartTrialButton } from "@/components/trial/start-trial-button"
import { Link } from "@workspace/i18n/navigation"
import { buttonVariants } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { getOptionalRequestContext } from "@/lib/core/auth-context"
import { getTrialStatus } from "@/lib/organization/trial-service"

/** Start-trial entry point; renders nothing for paid organizations. */
export async function TrialCard() {
  const ctx = await getOptionalRequestContext()
  if (!ctx) return null
  const status = await getTrialStatus(ctx.organizationId)
  if (!status) return null

  const t = await getTranslations("Trial")
  const format = await getFormatter()
  const canStart = ctx.role === "owner" || ctx.role === "admin"

  const description =
    status.state === "active"
      ? t("activeDescription", {
          days: status.daysLeft,
          date: format.dateTime(status.trialEndsAt!, { dateStyle: "long" }),
        })
      : status.state === "ended"
        ? t("endedDescription")
        : t("availableDescription")

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {status.state === "available" ? (
          canStart ? (
            <StartTrialButton />
          ) : (
            <p className="text-sm text-muted-foreground">{t("adminOnly")}</p>
          )
        ) : (
          <Link
            href="/pricing"
            className={buttonVariants({ variant: "outline" })}
          >
            {t("choosePlan")}
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
