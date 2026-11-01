"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { authClient } from "@/lib/auth-client"
import { getInitials } from "@workspace/organization/utils"

/**
 * Organization picker for two flows that share one page:
 *
 * - an interrupted OAuth authorization (`postLogin`, no `redirectTo`): pick the
 *   organization and continue the request with `oauth2.continue`;
 * - a domain app switching organization (`redirectTo`, #160): post to
 *   `/api/organizations/switch`, which updates the active organization and
 *   sends the browser back into the app's sign-in flow.
 */
export function SelectOrganizationForm() {
  const t = useTranslations("Oauth.selectOrganization")
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get("redirectTo")
  const { data: organizations, isPending } = authClient.useListOrganizations()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(organizationId: string) {
    setSubmitting(true)
    setError(null)
    const { error: activeError } = await authClient.organization.setActive({
      organizationId,
    })
    if (activeError) {
      setError(activeError.message ?? t("genericError"))
      setSubmitting(false)
      return
    }
    const { data, error: continueError } = await authClient.oauth2.continue({
      postLogin: true,
    })
    if (continueError) {
      setError(continueError.message ?? t("genericError"))
      setSubmitting(false)
      return
    }
    const redirectUri = (data as { redirect_uri?: string } | null)?.redirect_uri
    if (!redirectUri) {
      setError(t("genericError"))
      setSubmitting(false)
      return
    }
    window.location.href = redirectUri
  }

  const list = (
    <>
      {isPending && (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      )}
      {!isPending && (organizations?.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">{t("noOrganizations")}</p>
      )}
    </>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {list}
        {redirectTo ? (
          <form
            method="post"
            action="/api/organizations/switch"
            className="flex flex-col gap-3"
          >
            <input type="hidden" name="redirectTo" value={redirectTo} />
            {organizations?.map((organization) => (
              <Button
                key={organization.id}
                type="submit"
                name="organizationId"
                value={organization.id}
                variant="outline"
                className="justify-start"
              >
                <span className="flex size-6 items-center justify-center rounded bg-muted text-xs">
                  {getInitials(organization.name)}
                </span>
                {organization.name}
              </Button>
            ))}
          </form>
        ) : (
          <>
            {organizations?.map((organization) => (
              <Button
                key={organization.id}
                type="button"
                variant="outline"
                className="justify-start"
                disabled={submitting}
                onClick={() => choose(organization.id)}
              >
                <span className="flex size-6 items-center justify-center rounded bg-muted text-xs">
                  {getInitials(organization.name)}
                </span>
                {organization.name}
              </Button>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
