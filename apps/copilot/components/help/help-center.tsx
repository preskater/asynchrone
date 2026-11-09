import {
  ActivityIcon,
  BookOpenIcon,
  LifeBuoyIcon,
  ScaleIcon,
  type LucideIcon,
} from "lucide-react"
import { getLocale, getTranslations } from "next-intl/server"

import { appOrigin } from "@workspace/contracts/server"
import { SUPPORT_EMAIL } from "@workspace/core/support"
import { Link } from "@workspace/i18n/navigation"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

/**
 * Help center (#101): FAQ, ticket form, status page and the published support
 * policy. `feedbackHref` is org-scoped when the user is inside a workspace.
 */
export async function HelpCenter({ feedbackHref }: { feedbackHref: string }) {
  const t = await getTranslations("Support")
  const locale = await getLocale()
  const landing = `${appOrigin("landing")}/${locale}`

  const entries: {
    icon: LucideIcon
    title: string
    description: string
    href: string
    internal?: boolean
  }[] = [
    {
      icon: LifeBuoyIcon,
      title: t("contactSupport"),
      description: t("contactDescription"),
      href: feedbackHref,
      internal: true,
    },
    {
      icon: BookOpenIcon,
      title: t("faq"),
      description: t("faqDescription"),
      href: `${landing}/faq`,
    },
    {
      icon: ActivityIcon,
      title: t("status"),
      description: t("statusDescription"),
      href: "/api/status",
    },
    {
      icon: ScaleIcon,
      title: t("policy"),
      description: t("policyDescription"),
      href: `${landing}/support`,
    },
  ]

  return (
    <div className="flex flex-1 flex-col px-4 py-4 md:py-6 lg:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("helpTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("helpDescription")}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {entries.map((entry) => {
            const card = (
              <Card className="h-full transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <entry.icon className="size-4" />
                    {entry.title}
                  </CardTitle>
                  <CardDescription>{entry.description}</CardDescription>
                </CardHeader>
              </Card>
            )
            return entry.internal ? (
              <Link key={entry.title} href={entry.href}>
                {card}
              </Link>
            ) : (
              <a
                key={entry.title}
                href={entry.href}
                target="_blank"
                rel="noreferrer"
              >
                {card}
              </a>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("hoursSummary")}{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">
            {SUPPORT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  )
}
