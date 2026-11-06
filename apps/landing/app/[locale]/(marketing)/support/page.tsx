import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { ORG_PLANS } from "@workspace/core/plans"
import {
  SUPPORT_CHANNELS,
  SUPPORT_EMAIL,
  SUPPORT_RESPONSE_HOURS,
  SUPPORT_SEVERITIES,
} from "@workspace/core/support"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { PageHeader } from "@/components/landing/page-header"
import { Section } from "@/components/landing/section"
import { marketingMetadata } from "@/lib/seo"
import { workspaceUrl } from "@/lib/workspace"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Support.page")
  return marketingMetadata({
    path: "/support",
    title: t("metadataTitle"),
    description: t("metadataDescription"),
  })
}

/** Published support policy (#101), rendered from `@workspace/core/support`. */
export default async function SupportPolicyPage() {
  const t = await getTranslations("Support")

  // Targets are business hours; a 9-hour business day reads better as days.
  function target(hours: number | null) {
    if (hours === null) return t("bestEffort")
    return hours % 9 === 0
      ? t("targetDays", { days: hours / 9 })
      : t("targetHours", { hours })
  }

  return (
    <>
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t("page.title")}
        description={t("page.description")}
      />
      <Section className="pt-0">
        <div className="flex flex-col gap-12">
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{t("page.contactTitle")}</h2>
            <p className="text-muted-foreground">
              {t("page.contactDescription", { email: SUPPORT_EMAIL })}
            </p>
            <p className="text-sm text-muted-foreground">{t("hoursSummary")}</p>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{t("page.channelsTitle")}</h2>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("page.planColumn")}</TableHead>
                    <TableHead>{t("page.channelsColumn")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ORG_PLANS.map((plan) => (
                    <TableRow key={plan}>
                      <TableCell className="font-medium">
                        {t(`plans.${plan}`)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {SUPPORT_CHANNELS[plan]
                          .map((channel) => t(`channels.${channel}` as never))
                          .join(" · ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{t("page.targetsTitle")}</h2>
            <p className="text-muted-foreground">
              {t("page.targetsDescription")}
            </p>
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("page.planColumn")}</TableHead>
                    {SUPPORT_SEVERITIES.map((severity) => (
                      <TableHead key={severity}>
                        {t(`severities.${severity}.name`)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ORG_PLANS.map((plan) => (
                    <TableRow key={plan}>
                      <TableCell className="font-medium">
                        {t(`plans.${plan}`)}
                      </TableCell>
                      {SUPPORT_SEVERITIES.map((severity) => (
                        <TableCell key={severity}>
                          {target(SUPPORT_RESPONSE_HOURS[plan][severity])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">{t("page.severityTitle")}</h2>
            <dl className="flex flex-col gap-3">
              {SUPPORT_SEVERITIES.map((severity) => (
                <div key={severity}>
                  <dt className="font-medium">
                    {t(`severities.${severity}.name`)}
                  </dt>
                  <dd className="text-muted-foreground">
                    {t(`severities.${severity}.description`)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div id="status" className="flex flex-col items-start gap-3">
            <h2 className="text-xl font-semibold">{t("page.statusTitle")}</h2>
            <p className="text-muted-foreground">
              {t("page.statusDescription")}
            </p>
            <Button
              variant="outline"
              nativeButton={false}
              render={<a href={`${workspaceUrl}/api/status`} />}
            >
              {t("page.statusCta")}
            </Button>
          </div>
        </div>
      </Section>
    </>
  )
}
