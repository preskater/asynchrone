"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { authClient } from "@/lib/auth-client"

function BackupCodes({ codes }: { codes: string[] }) {
  const t = useTranslations("Account.twoFactor")

  function download() {
    const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "asynchrone-space-backup-codes.txt"
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("backupCodes")}</p>
      <ul className="grid grid-cols-2 gap-1 rounded-md bg-muted p-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t("backupCodesHint")}</p>
      <Button type="button" variant="outline" size="sm" onClick={download}>
        {t("downloadBackupCodes")}
      </Button>
    </div>
  )
}

export function TwoFactorCard() {
  const t = useTranslations("Account.twoFactor")
  const { data: session, isPending: loading, refetch } = authClient.useSession()
  const enabled = Boolean(session?.user.twoFactorEnabled)

  const [password, setPassword] = React.useState("")
  const [enrollment, setEnrollment] = React.useState<{
    uri: string
    backupCodes: string[]
  } | null>(null)
  const [newBackupCodes, setNewBackupCodes] = React.useState<string[] | null>(
    null
  )
  const [code, setCode] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setPending(true)
    setError(null)
    await action()
    setPending(false)
  }

  function start(event: React.FormEvent) {
    event.preventDefault()
    return run(async () => {
      const { data, error } = await authClient.twoFactor.enable({ password })
      if (error || !data || !("totpURI" in data)) {
        setError(t("invalidPassword"))
        return
      }
      setEnrollment({ uri: data.totpURI, backupCodes: data.backupCodes })
      setPassword("")
    })
  }

  function confirm(event: React.FormEvent) {
    event.preventDefault()
    return run(async () => {
      const { error } = await authClient.twoFactor.verifyTotp({
        code: code.trim(),
      })
      if (error) {
        setError(t("invalidCode"))
        return
      }
      toast.success(t("enabledToast"))
      setEnrollment(null)
      setCode("")
      await refetch()
    })
  }

  function regenerate() {
    return run(async () => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({
        password,
      })
      if (error || !data) {
        setError(t("invalidPassword"))
        return
      }
      setNewBackupCodes(data.backupCodes)
      setPassword("")
    })
  }

  function disable() {
    return run(async () => {
      const { error } = await authClient.twoFactor.disable({ password })
      if (error) {
        setError(t("invalidPassword"))
        return
      }
      toast.success(t("disabledToast"))
      setPassword("")
      setNewBackupCodes(null)
      await refetch()
    })
  }

  const secret = enrollment
    ? new URL(enrollment.uri).searchParams.get("secret")
    : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("title")}
          {loading ? null : (
            <Badge variant={enabled ? "default" : "secondary"}>
              {enabled ? t("on") : t("off")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Spinner />
        ) : enrollment ? (
          <form onSubmit={confirm} className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("scan")}</p>
              <div className="w-fit rounded-md bg-white p-3">
                <QRCodeSVG value={enrollment.uri} size={160} />
              </div>
              {secret ? (
                <p className="text-xs text-muted-foreground">
                  {t("manualKey")}{" "}
                  <code className="font-mono break-all">{secret}</code>
                </p>
              ) : null}
            </div>
            <BackupCodes codes={enrollment.backupCodes} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="two-factor-confirm-code">
                  {t("confirmCode")}
                </FieldLabel>
                <Input
                  id="two-factor-confirm-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              </Field>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <Field orientation="horizontal">
                <Button type="submit" disabled={pending || !code.trim()}>
                  {pending ? <Spinner /> : null}
                  {t("enable")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEnrollment(null)}
                >
                  {t("cancel")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={enabled ? (event) => event.preventDefault() : start}>
            <FieldGroup>
              {newBackupCodes ? <BackupCodes codes={newBackupCodes} /> : null}
              <Field>
                <FieldLabel htmlFor="two-factor-password">
                  {t("password")}
                </FieldLabel>
                <Input
                  id="two-factor-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <FieldDescription>
                  {enabled ? t("passwordHintEnabled") : t("passwordHint")}
                </FieldDescription>
              </Field>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <Field orientation="horizontal">
                {enabled ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending || !password}
                      onClick={regenerate}
                    >
                      {t("regenerate")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={pending || !password}
                      onClick={disable}
                    >
                      {t("disable")}
                    </Button>
                  </>
                ) : (
                  <Button type="submit" disabled={pending || !password}>
                    {pending ? <Spinner /> : null}
                    {t("start")}
                  </Button>
                )}
              </Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
