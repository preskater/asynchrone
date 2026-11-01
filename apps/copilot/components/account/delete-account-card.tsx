"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Trash2Icon } from "lucide-react"

import { deleteAccountAction } from "@/actions/account"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { authClient } from "@/lib/auth-client"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"

export function DeleteAccountCard() {
  const t = useTranslations("Account")
  const te = useErrorTranslator()
  const { data: session } = authClient.useSession()
  const [hasPassword, setHasPassword] = React.useState(true)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [deleting, setDeleting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    authClient
      .listAccounts()
      .then(({ data }) => {
        if (active && data) {
          setHasPassword(
            data.some((account) => account.providerId === "credential")
          )
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const userEmail = session?.user.email ?? ""
  const canSubmit =
    email.trim().toLowerCase() === userEmail.toLowerCase() &&
    (!hasPassword || password.length > 0)

  async function deleteAccount(event: React.MouseEvent) {
    // Keep the dialog open so an error stays visible next to the fields.
    event.preventDefault()
    setDeleting(true)
    setError(null)
    try {
      unwrapActionResult(
        await deleteAccountAction({
          email,
          password: hasPassword ? password : undefined,
        })
      )
      // The session is gone server-side; a full load clears client state.
      window.location.assign("/sign-in")
    } catch (err) {
      setError(te(err, "internal"))
      setDeleting(false)
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t("deleteAccount")}</CardTitle>
        <CardDescription>{t("deleteAccountDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="destructive" />}>
            <Trash2Icon data-icon="inline-start" />
            {t("deleteAccount")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("deleteAccountConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteAccountConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="delete-account-email">
                  {t("deleteAccountTypeEmail", { email: userEmail })}
                </FieldLabel>
                <Input
                  id="delete-account-email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-describedby={error ? "delete-account-error" : undefined}
                />
              </Field>
              {hasPassword ? (
                <Field>
                  <FieldLabel htmlFor="delete-account-password">
                    {t("currentPassword")}
                  </FieldLabel>
                  <Input
                    id="delete-account-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    aria-describedby={
                      error ? "delete-account-error" : undefined
                    }
                  />
                </Field>
              ) : null}
              {error ? (
                <FieldError id="delete-account-error">{error}</FieldError>
              ) : null}
            </FieldGroup>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={!canSubmit || deleting}
                onClick={deleteAccount}
              >
                {t("deleteAccount")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
