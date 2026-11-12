import { getFormatter, getTranslations } from "next-intl/server"
import { MailIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { Link } from "@workspace/i18n/navigation"

import { AcceptGuestInvitationButton } from "@/components/guests/guest-controls"
import { guestService } from "@/lib/guests"
import { getGuestUser } from "@/lib/guests/session"

/**
 * Invitation link landing. A new person signs up and comes straight back
 * here; no onboarding, no organization of their own is needed.
 */
export default async function AcceptGuestInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token = "" } = await searchParams
  const [t, format, invitation, user] = await Promise.all([
    getTranslations("Guests"),
    getFormatter(),
    token ? guestService.preview(token) : null,
    getGuestUser(),
  ])

  if (!invitation?.open) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>{t("invitationClosedTitle")}</CardTitle>
          <CardDescription>{t("invitationClosed")}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const back = `/guest/accept?token=${encodeURIComponent(token)}`
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4" />
          {t("acceptTitle", { project: invitation.projectName })}
        </CardTitle>
        <CardDescription>
          {t("acceptDescription", {
            organization: invitation.organizationName,
            email: invitation.email,
            date: format.dateTime(invitation.expiresAt, {
              dateStyle: "medium",
            }),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {user ? (
          <AcceptGuestInvitationButton token={token} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("signInToAccept", { email: invitation.email })}
            </p>
            <Button
              render={
                <Link
                  href={`/sign-in?redirect=${encodeURIComponent(back)}`}
                  prefetch={false}
                />
              }
            >
              {t("signIn")}
            </Button>
            <Button
              variant="outline"
              render={
                <Link
                  href={`/sign-up?redirect=${encodeURIComponent(back)}`}
                  prefetch={false}
                />
              }
            >
              {t("signUp")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
