"use client"

import { useEffect, useState } from "react"
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

interface PublicClient {
  client_name?: string
  name?: string
}

const SCOPE_KEYS = new Set([
  "openid",
  "profile",
  "email",
  "offline_access",
  "projects",
  "calendars",
  "files",
  "messaging",
])

export function ConsentForm() {
  const t = useTranslations("Oauth.consent")
  const searchParams = useSearchParams()

  const clientId = searchParams.get("client_id") ?? ""
  const scopes = (searchParams.get("scope") ?? "")
    .split(" ")
    .filter(Boolean)

  const [clientName, setClientName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clientId) return
    let active = true
    authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then(({ data }) => {
        if (!active || !data) return
        const client = data as PublicClient
        setClientName(client.client_name ?? client.name ?? clientId)
      })
    return () => {
      active = false
    }
  }, [clientId])

  async function decide(accept: boolean) {
    setSubmitting(true)
    setError(null)
    const { data, error: requestError } = await authClient.oauth2.consent({
      accept,
    })
    if (requestError) {
      setError(requestError.message ?? t("genericError"))
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

  const displayName = clientName ?? t("unknownClient")

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title", { client: displayName })}</CardTitle>
        <CardDescription>
          {t("description", { client: displayName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {scopes.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{t("scopesTitle")}</p>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {scopes.map((scope) => (
                <li key={scope} className="flex items-start gap-2">
                  <span aria-hidden>•</span>
                  <span>
                    {SCOPE_KEYS.has(scope)
                      ? t(`scope_${scope}` as "scope_openid")
                      : scope}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => decide(false)}
          >
            {t("deny")}
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => decide(true)}
          >
            {t("allow")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
