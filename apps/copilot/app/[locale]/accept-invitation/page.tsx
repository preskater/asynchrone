import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import { MailIcon } from "lucide-react"

import { AcceptInvitationCard } from "@/components/organization/accept-invitation-card"
import { AuthHomeButton } from "@/components/auth-home-button"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { auth } from "@/lib/auth"

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  const { id } = await searchParams

  if (!id) {
    redirect("/onboarding")
  }

  const session = await auth.api.getSession({ headers: await headers() })

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="absolute start-6 top-6">
        <AuthHomeButton />
      </div>
      <div className="w-full max-w-md">
        {session ? (
          <AcceptInvitationCard invitationId={id} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MailIcon className="size-4" />
                You&apos;ve been invited
              </CardTitle>
              <CardDescription>
                Sign in or create an account with the email the invitation was
                sent to.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button
                render={
                  <Link
                    href={`/sign-in?redirect=${encodeURIComponent(
                      `/accept-invitation?id=${id}`
                    )}`}
                  />
                }
              >
                Sign in
              </Button>
              <Button
                variant="outline"
                render={
                  <Link
                    href={`/sign-up?redirect=${encodeURIComponent(
                      `/accept-invitation?id=${id}`
                    )}`}
                  />
                }
              >
                Create an account
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
