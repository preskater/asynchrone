import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { FolderKanbanIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { Link } from "@workspace/i18n/navigation"

import { guestService } from "@/lib/guests"
import { getGuestUser } from "@/lib/guests/session"

export default async function GuestHomePage() {
  const user = await getGuestUser()
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent("/guest")}`)

  const [t, format, grants] = await Promise.all([
    getTranslations("Guests"),
    getFormatter(),
    guestService.listForUser(user.id),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("spaceTitle")}</CardTitle>
        <CardDescription>{t("spaceDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {grants.map((grant) => (
              <li
                key={grant.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <Link
                  href={`/guest/${grant.id}`}
                  prefetch={false}
                  className="flex items-center gap-2 font-medium hover:underline"
                >
                  <FolderKanbanIcon className="size-4 text-muted-foreground" />
                  {grant.projectName}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {grant.organizationName} · {t("expires")}{" "}
                  {format.dateTime(grant.expiresAt, { dateStyle: "medium" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
