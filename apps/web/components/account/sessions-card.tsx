"use client"

import * as React from "react"
import { useFormatter, useNow, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Link } from "@workspace/i18n/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"

import { describeUserAgent } from "@workspace/auth/user-agent"
import { authClient } from "@/lib/auth-client"

interface ActiveSession {
  id: string
  token: string
  userAgent?: string | null
  ipAddress?: string | null
  updatedAt: Date
}

export function SessionsCard() {
  const t = useTranslations("Account.sessions")
  const format = useFormatter()
  const now = useNow()
  const { data: current } = authClient.useSession()
  const currentToken = current?.session.token

  const [sessions, setSessions] = React.useState<ActiveSession[] | null>(null)
  // Better Auth only lists sessions opened in the last 24 hours ("fresh").
  const [stale, setStale] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const { data, error } = await authClient.listSessions()
    if (error) {
      if (error.code === "SESSION_NOT_FRESH") setStale(true)
      else setError(t("loadError"))
      return
    }
    setSessions(
      [...data].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    )
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  async function revoke(token: string) {
    setPending(token)
    const { error } = await authClient.revokeSession({ token })
    setPending(null)
    if (error) {
      toast.error(t("revokeError"))
      return
    }
    toast.success(t("revoked"))
    await load()
  }

  async function revokeOthers() {
    setPending("others")
    const { error } = await authClient.revokeOtherSessions()
    setPending(null)
    if (error) {
      toast.error(t("revokeError"))
      return
    }
    toast.success(t("othersRevoked"))
    await load()
  }

  const others = sessions?.filter((session) => session.token !== currentToken)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stale ? (
          <p className="text-sm text-muted-foreground">
            {t("stale")}{" "}
            <Link href="/sign-in?redirect=/settings/account">
              {t("signInAgain")}
            </Link>
          </p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !sessions ? (
          <Spinner />
        ) : (
          <>
            <ul className="divide-y rounded-md border">
              {sessions.map((session) => {
                const isCurrent = session.token === currentToken
                return (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {describeUserAgent(session.userAgent) ??
                          t("unknownDevice")}
                        {isCurrent ? (
                          <Badge variant="secondary">{t("current")}</Badge>
                        ) : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.ipAddress ?? t("unknownIp")} ·{" "}
                        {t("lastActive", {
                          time: format.relativeTime(
                            new Date(session.updatedAt),
                            now
                          ),
                        })}
                      </p>
                    </div>
                    {isCurrent ? null : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => revoke(session.token)}
                      >
                        {pending === session.token ? <Spinner /> : null}
                        {t("revoke")}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            {others && others.length > 0 ? (
              <Button
                variant="destructive"
                disabled={pending !== null}
                onClick={revokeOthers}
              >
                {pending === "others" ? <Spinner /> : null}
                {t("revokeOthers")}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
