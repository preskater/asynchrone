import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { TwoFactorCard } from "@/components/account/two-factor-card"
import { AuthHomeButton } from "@/components/auth-home-button"
import { Button } from "@workspace/ui/components/button"

import { auth } from "@/lib/auth"
import { safeRedirect } from "@workspace/core/redirect"

/** Where the workspace gate sends members of an organization that requires 2FA. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/sign-in")

  const { next } = await searchParams
  const continueTo = safeRedirect(next)
  const t = await getTranslations("Auth.twoFactorSetup")

  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="absolute start-6 top-6">
        <AuthHomeButton />
      </div>
      <div className="flex w-full max-w-md flex-col gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        <TwoFactorCard />
        <Button nativeButton={false} render={<a href={continueTo} />}>
          {t("continue")}
        </Button>
      </div>
    </div>
  )
}
