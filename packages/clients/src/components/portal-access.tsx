"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { CheckIcon, CopyIcon, PlusIcon, UserXIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useClientActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type { PortalAccessData } from "../portal"
import { useErrorTranslator } from "@workspace/i18n/errors"

/** Portal users and pending invitations of one client company. */
export function PortalAccessCard({
  clientId,
  access,
  canManage,
}: {
  clientId: string
  access: PortalAccessData
  canManage: boolean
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()
  const { revokePortalMemberAction, cancelPortalInviteAction } =
    useClientActions()

  async function handleRevoke(memberId: string) {
    try {
      unwrapActionResult(await revokePortalMemberAction({ memberId }))
      toast.success(tT("portalAccessRevoked"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  async function handleCancelInvite(inviteId: string) {
    try {
      unwrapActionResult(await cancelPortalInviteAction({ inviteId }))
      toast.success(tT("portalInviteCancelled"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{t("portal.title")}</CardTitle>
          {canManage ? (
            <InvitePortalUserDialog
              clientId={clientId}
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <PlusIcon data-icon="inline-start" />
                  {t("portal.invite")}
                </Button>
              }
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t("portal.description")}
        </p>

        {access.members.length === 0 && access.invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("portal.empty")}</p>
        ) : null}

        {access.members.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {access.members.map((member) => (
              <li
                key={member.memberId}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {member.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{t("portal.activeBadge")}</Badge>
                  {canManage ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("portal.revoke")}
                      onClick={() => void handleRevoke(member.memberId)}
                    >
                      <UserXIcon className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {access.invites.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {access.invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">
                    {invite.name ?? invite.email}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {invite.email}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{t("portal.pendingBadge")}</Badge>
                  {canManage ? (
                    <>
                      {invite.invitationId ? (
                        <CopyInviteLinkButton
                          invitationId={invite.invitationId}
                        />
                      ) : null}
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t("portal.cancelInvite")}
                        onClick={() => void handleCancelInvite(invite.id)}
                      >
                        <XIcon className="size-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

function inviteUrl(invitationId: string) {
  return `${window.location.origin}/accept-invitation?id=${encodeURIComponent(invitationId)}`
}

/** Small copy button for a pending invitation link. */
function CopyInviteLinkButton({ invitationId }: { invitationId: string }) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl(invitationId))
      setCopied(true)
      toast.success(tT("portalLinkCopied"))
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("portal.copyFailed"))
    }
  }

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={t("portal.copyLink")}
      onClick={() => void copy()}
    >
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </Button>
  )
}

/** Dialog to invite a company contact to the portal; shows the link to share. */
export function InvitePortalUserDialog({
  clientId,
  trigger,
}: {
  clientId: string
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()
  const { invitePortalUserAction } = useClientActions()

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [link, setLink] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!email.trim()) return
    setSubmitting(true)
    try {
      const result = unwrapActionResult(
        await invitePortalUserAction({
          clientId,
          email: email.trim(),
          name: name.trim() || undefined,
        })
      )
      const invitationId = result.invite.invitationId
      if (invitationId) setLink(inviteUrl(invitationId))
      toast.success(tT("portalInviteCreated"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setName("")
          setEmail("")
          setLink(null)
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("portal.inviteTitle")}</DialogTitle>
          <DialogDescription>{t("portal.inviteDescription")}</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="portal-invite-link">
                {t("portal.linkLabel")}
              </FieldLabel>
              <div className="flex items-center gap-2">
                <Input id="portal-invite-link" readOnly value={link} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(link)
                      .then(() => toast.success(tT("portalLinkCopied")))
                      .catch(() => toast.error(t("portal.copyFailed")))
                  }}
                >
                  <CopyIcon data-icon="inline-start" />
                  {t("portal.copyLink")}
                </Button>
              </div>
            </Field>
            <p className="text-xs text-muted-foreground">
              {t("portal.shareHint")}
            </p>
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>
                {t("common.close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="portal-invite-name">
                  {t("portal.name")}
                </FieldLabel>
                <Input
                  id="portal-invite-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("portal.namePlaceholder")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-invite-email">
                  {t("portal.email")}
                </FieldLabel>
                <Input
                  id="portal-invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={t("portal.emailPlaceholder")}
                />
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting || !email.trim()}>
                {submitting ? <Spinner className="size-4" /> : null}
                {t("portal.sendInvite")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
