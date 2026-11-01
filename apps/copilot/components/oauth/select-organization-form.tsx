"use client"

import { useState } from "react"
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

export function SelectOrganizationForm() {
  const t = useTranslations("Oauth.selectOrganization")
  const { data: organizations, isPending } =
    authClient.useListOrganizations()
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
    const redirectUri = (data as { redirect_uri?: string } | null)
      ?.redirect_uri
    if (!redirectUri) {
      setError(t("genericError"))
      setSubmitting(false)
      return
    }
    window.location.href = redirectUri
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending && (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        )}
        {!isPending && (organizations?.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">{t("noOrganizations")}</p>
        )}
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
      </CardContent>
    </Card>
  )
}
