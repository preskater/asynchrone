"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { authClient } from "@/lib/auth-client"
import { safeRedirect } from "@workspace/core/redirect"

export function TwoFactorForm() {
  const t = useTranslations("Auth.twoFactor")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [useBackupCode, setUseBackupCode] = useState(false)
  const [code, setCode] = useState("")
  const [trustDevice, setTrustDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const input = { code: code.trim(), trustDevice }
    const { error } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode(input)
      : await authClient.twoFactor.verifyTotp(input)
    if (error) {
      // The pending sign-in cookie lasts 10 minutes; repeated failures lock
      // the account for a while. Anything else is a wrong code.
      setError(
        error.code === "INVALID_TWO_FACTOR_COOKIE"
          ? t("expired")
          : error.code === "ACCOUNT_TEMPORARILY_LOCKED"
            ? t("locked")
            : t("invalidCode")
      )
      setPending(false)
      return
    }
    router.push(safeRedirect(searchParams.get("redirect")))
    router.refresh()
  }

  function switchMethod() {
    setUseBackupCode((value) => !value)
    setCode("")
    setError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {useBackupCode ? t("backupDescription") : t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="two-factor-code">
                {useBackupCode ? t("backupCode") : t("code")}
              </FieldLabel>
              <Input
                id="two-factor-code"
                autoFocus
                required
                autoComplete="one-time-code"
                inputMode={useBackupCode ? "text" : "numeric"}
                maxLength={useBackupCode ? 32 : 6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                aria-invalid={error ? true : undefined}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="two-factor-trust"
                checked={trustDevice}
                onCheckedChange={(checked) => setTrustDevice(checked === true)}
              />
              <FieldLabel htmlFor="two-factor-trust">
                {t("trustDevice")}
              </FieldLabel>
            </Field>
            {error ? <FieldError errors={[{ message: error }]} /> : null}
            <Field>
              <Button type="submit" disabled={pending || !code.trim()}>
                {pending ? t("verifying") : t("submit")}
              </Button>
              <Button type="button" variant="ghost" onClick={switchMethod}>
                {useBackupCode ? t("useAuthenticator") : t("useBackupCode")}
              </Button>
              <FieldDescription className="text-center">
                {t("lostDevice")}{" "}
                <Link href="/sign-in">{t("backToSignIn")}</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
