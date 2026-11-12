"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { PlanUpgradePrompt } from "@/components/organization/plan-upgrade-prompt"
import { RolePicker } from "@/components/organization/role-picker"
import { authClient } from "@/lib/auth-client"
import { useEntitlements } from "@/lib/organization/use-entitlements"
import { INVITABLE_ROLES, type OrgRole } from "@workspace/organization/roles"
import { buildInviteUrl } from "@workspace/organization/utils"

export function InviteMemberDialog({
  onInvited,
  trigger,
}: {
  onInvited?: () => void
  trigger?: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const t = useTranslations("Org")
  const { can } = useEntitlements()
  const multipleRoles = can("granularPermissions")
  const [email, setEmail] = React.useState("")
  const [roles, setRoles] = React.useState<OrgRole[]>(["member"])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [seatLimitReached, setSeatLimitReached] = React.useState(false)
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setEmail("")
      setRoles(["member"])
      setError(null)
      setSeatLimitReached(false)
      setInviteUrl(null)
      setCopied(false)
    }
  }, [open])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError(t("pleaseEnterEmail"))
      return
    }
    setSubmitting(true)
    setError(null)
    const { data, error } = await authClient.organization.inviteMember({
      email: trimmed,
      role: roles,
    })
    if (error?.code === "UPGRADE_REQUIRED") {
      setSeatLimitReached(true)
      setSubmitting(false)
      return
    }
    if (error || !data) {
      setError(error?.message ?? t("unableToSendInvitation"))
      setSubmitting(false)
      return
    }
    setInviteUrl(buildInviteUrl(data.id))
    setSubmitting(false)
    onInvited?.()
  }

  async function copyLink() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    toast.success(t("inviteLinkCopied"))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button size="sm" />}>
        {trigger ? null : (
          <>
            <PlusIcon data-icon="inline-start" />
            {t("inviteMember")}
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteMember")}</DialogTitle>
          <DialogDescription>{t("inviteSomeoneDescription")}</DialogDescription>
        </DialogHeader>

        {inviteUrl ? (
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="invite-link">{t("inviteLink")}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input id="invite-link" value={inviteUrl} readOnly />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copyLink}
                  aria-label={t("copyInviteLink")}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
              <FieldDescription>{t("inviteLinkDescription")}</FieldDescription>
            </Field>
            <DialogFooter>
              <DialogClose render={<Button />}>{t("done")}</DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("emailPlaceholder")}
                  autoFocus
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-role">{t("role")}</FieldLabel>
                <RolePicker
                  id="invite-role"
                  value={roles}
                  options={INVITABLE_ROLES.map((item) => item.value)}
                  multiple={multipleRoles}
                  onChange={setRoles}
                />
                {multipleRoles ? null : (
                  <PlanUpgradePrompt feature="multipleRoles" className="mt-2" />
                )}
              </Field>
              {seatLimitReached ? <PlanUpgradePrompt feature="seats" /> : null}
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t("cancel")}
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner /> : null}
                {submitting ? t("sending") : t("sendInvite")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
