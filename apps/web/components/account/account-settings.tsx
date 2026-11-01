"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
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

import {
  listUserRepositoryTokensAction,
  removeUserRepositoryTokenAction,
  setUserRepositoryTokenAction,
} from "@/actions/integrations"
import { TwoFactorCard } from "@/components/account/two-factor-card"
import { DeleteAccountCard } from "@/components/account/delete-account-card"
import { SessionsCard } from "@/components/account/sessions-card"
import { UserAppearanceCard } from "@/components/appearance/user-appearance-card"
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPROMISED,
} from "@workspace/auth/password-policy"
import { authClient } from "@/lib/auth-client"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"

function ProfileCard() {
  const t = useTranslations("Account")
  const { data: session, refetch } = authClient.useSession()
  const user = session?.user

  const [name, setName] = React.useState("")
  const [image, setImage] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setName(user?.name ?? "")
    setImage(user?.image ?? "")
  }, [user?.name, user?.image])

  const dirty = name !== (user?.name ?? "") || image !== (user?.image ?? "")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t("nameRequired"))
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await authClient.updateUser({
      name: trimmedName,
      image: image.trim() || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message ?? t("unableToUpdateProfile"))
      return
    }
    toast.success(t("profileUpdated"))
    await refetch()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile")}</CardTitle>
        <CardDescription>{t("profileDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-name">{t("name")}</FieldLabel>
              <Input
                id="account-name"
                value={name}
                placeholder={t("namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-email">{t("email")}</FieldLabel>
              <Input id="account-email" value={user?.email ?? ""} disabled />
              <FieldDescription>{t("emailDescription")}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="account-image">{t("imageUrl")}</FieldLabel>
              <Input
                id="account-image"
                value={image}
                placeholder={t("imageUrlPlaceholder")}
                onChange={(event) => setImage(event.target.value)}
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Field orientation="horizontal">
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? <Spinner /> : null}
                {saving ? t("saving") : t("save")}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function SecurityCard() {
  const t = useTranslations("Account")
  const [currentPassword, setCurrentPassword] = React.useState("")
  const [newPassword, setNewPassword] = React.useState("")
  const [confirmPassword, setConfirmPassword] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    confirmPassword.length > 0

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(t("passwordTooShort", { min: MIN_PASSWORD_LENGTH }))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordsDoNotMatch"))
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      // A changed password must sign out every other device (issue #94).
      revokeOtherSessions: true,
    })
    setSaving(false)
    if (error) {
      setError(
        error.code === PASSWORD_COMPROMISED
          ? t("passwordCompromised")
          : (error.message ?? t("unableToUpdatePassword"))
      )
      return
    }
    toast.success(t("passwordUpdated"))
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("security")}</CardTitle>
        <CardDescription>{t("securityDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="account-current-password">
                {t("currentPassword")}
              </FieldLabel>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-new-password">
                {t("newPassword")}
              </FieldLabel>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="account-confirm-password">
                {t("confirmPassword")}
              </FieldLabel>
              <Input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Field orientation="horizontal">
              <Button type="submit" disabled={!canSubmit || saving}>
                {saving ? <Spinner /> : null}
                {saving ? t("updating") : t("updatePassword")}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function RepositoryTokensCard() {
  const t = useTranslations("Account")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const labels: Record<"github" | "gitlab", string> = {
    github: "GitHub",
    gitlab: "GitLab",
  }
  const [configured, setConfigured] = React.useState<Record<
    "github" | "gitlab",
    boolean
  > | null>(null)
  const [drafts, setDrafts] = React.useState({ github: "", gitlab: "" })
  const [busy, setBusy] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    async function load() {
      try {
        const status = unwrapActionResult(
          await listUserRepositoryTokensAction()
        )
        if (active) setConfigured(status)
      } catch {
        if (active) setConfigured({ github: false, gitlab: false })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  async function save(provider: "github" | "gitlab") {
    const token = drafts[provider].trim()
    if (!token) return
    setBusy(provider)
    try {
      unwrapActionResult(
        await setUserRepositoryTokenAction({ provider, token })
      )
      setConfigured((previous) => ({
        ...(previous ?? { github: false, gitlab: false }),
        [provider]: true,
      }))
      setDrafts((previous) => ({ ...previous, [provider]: "" }))
      toast.success(tT("repositoryTokenSaved"))
    } catch (error) {
      toast.error(te(error))
    } finally {
      setBusy(null)
    }
  }

  async function remove(provider: "github" | "gitlab") {
    setBusy(provider)
    try {
      unwrapActionResult(await removeUserRepositoryTokenAction(provider))
      setConfigured((previous) => ({
        ...(previous ?? { github: false, gitlab: false }),
        [provider]: false,
      }))
      toast.success(tT("repositoryTokenRemoved"))
    } catch (error) {
      toast.error(te(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repositoryAccess")}</CardTitle>
        <CardDescription>{t("repositoryAccessDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {(["github", "gitlab"] as const).map((provider) => {
          const isConfigured = configured?.[provider] ?? false
          return (
            <div key={provider} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {labels[provider]}
                  </span>
                  <Badge variant={isConfigured ? "secondary" : "outline"}>
                    {isConfigured
                      ? t("tokenConfigured")
                      : t("tokenNotConfigured")}
                  </Badge>
                </div>
                {isConfigured ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void remove(provider)}
                  >
                    {busy === provider ? <Spinner /> : null}
                    {t("removeToken")}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  id={`account-${provider}-token`}
                  type="password"
                  autoComplete="off"
                  value={drafts[provider]}
                  placeholder={t("tokenPlaceholder")}
                  onChange={(event) =>
                    setDrafts((previous) => ({
                      ...previous,
                      [provider]: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy !== null || drafts[provider].trim().length === 0
                  }
                  onClick={() => void save(provider)}
                >
                  {busy === provider ? <Spinner /> : null}
                  {isConfigured ? t("replaceToken") : t("saveToken")}
                </Button>
              </div>
            </div>
          )
        })}
        <p className="text-xs text-muted-foreground">
          {t("repositoryTokensHint")}
        </p>
      </CardContent>
    </Card>
  )
}

function ConnectedAccountsCard({
  providers,
}: {
  providers: Array<"github" | "gitlab">
}) {
  const t = useTranslations("Account")
  const [accounts, setAccounts] = React.useState<Array<{
    providerId: string
    accountId: string
  }> | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const labels: Record<"github" | "gitlab", string> = {
    github: "GitHub",
    gitlab: "GitLab",
  }

  React.useEffect(() => {
    let active = true
    async function load() {
      try {
        const { data } = await authClient.listAccounts()
        if (active) {
          setAccounts(
            (data ?? []).map((account) => ({
              providerId: account.providerId,
              accountId: account.accountId,
            }))
          )
        }
      } catch {
        if (active) setAccounts([])
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  async function link(provider: "github" | "gitlab") {
    setBusy(provider)
    try {
      // Redirects to the provider on success; only failures return here.
      const { error } = await authClient.linkSocial({
        provider,
        callbackURL: window.location.href,
      })
      if (error) toast.error(error.message ?? t("linkFailed"))
    } catch {
      toast.error(t("linkFailed"))
    } finally {
      setBusy(null)
    }
  }

  async function unlink(provider: "github" | "gitlab") {
    const account = accounts?.find((item) => item.providerId === provider)
    if (!account) return
    setBusy(provider)
    try {
      const { error } = await authClient.unlinkAccount({
        accountId: account.accountId,
      })
      if (error) {
        toast.error(error.message ?? t("unlinkFailed"))
        return
      }
      setAccounts((previous) =>
        (previous ?? []).filter((item) => item.providerId !== provider)
      )
      toast.success(t("accountUnlinked"))
    } catch {
      toast.error(t("unlinkFailed"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("connectedAccounts")}</CardTitle>
        <CardDescription>{t("connectedAccountsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {providers.map((provider) => {
          const connected =
            accounts?.some((item) => item.providerId === provider) ?? false
          return (
            <div
              key={provider}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{labels[provider]}</span>
                <Badge variant={connected ? "secondary" : "outline"}>
                  {connected ? t("connected") : t("notConnected")}
                </Badge>
              </div>
              {connected ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void unlink(provider)}
                >
                  {busy === provider ? <Spinner /> : null}
                  {t("unlink")}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void link(provider)}
                >
                  {busy === provider ? <Spinner /> : null}
                  {t("connect")}
                </Button>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function AccountSettings({
  socialProviders = [],
}: {
  socialProviders?: Array<"github" | "gitlab">
}) {
  const t = useTranslations("Account")

  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="mt-3 flex flex-col gap-4">
        <ProfileCard />
        <UserAppearanceCard />
        <SecurityCard />
        <TwoFactorCard />
        <SessionsCard />
        <RepositoryTokensCard />
        {socialProviders.length > 0 ? (
          <ConnectedAccountsCard providers={socialProviders} />
        ) : null}
        <DeleteAccountCard />
      </div>
    </div>
  )
}
