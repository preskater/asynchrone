"use client"

import * as React from "react"
import { useRouter } from "@workspace/i18n/navigation"
import { useTranslations } from "next-intl"
import { Building2Icon, CheckIcon, MailIcon, XIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
} from "@workspace/ui/components/avatar"
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
import { useEnumLabel } from "@workspace/i18n/labels"
import { parseRoles } from "@workspace/organization/roles"
import { getInitials, slugify } from "@workspace/organization/utils"

interface PendingInvitation {
  id: string
  organizationName: string
  organizationSlug: string
  role: string | null
}

export function OnboardingFlow({
  userName,
  invitations: initialInvitations,
  subscribeInterval = null,
}: {
  userName: string
  invitations: PendingInvitation[]
  /** Set when the visitor clicked "Get Team": checkout starts after creation. */
  subscribeInterval?: "month" | "year" | null
}) {
  const router = useRouter()
  const t = useTranslations("Org")
  const L = useEnumLabel()
  const [invitations, setInvitations] =
    React.useState<PendingInvitation[]>(initialInvitations)

  const [pendingId, setPendingId] = React.useState<string | null>(null)

  const [name, setName] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function accept(invitationId: string) {
    setPendingId(invitationId)
    const invitation = invitations.find((item) => item.id === invitationId)
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    })
    if (error) {
      toast.error(error.message ?? t("unableToAcceptInvitation"))
      setPendingId(null)
      return
    }
    toast.success(t("welcomeToOrganization"))
    router.push(invitation ? `/${invitation.organizationSlug}` : "/onboarding")
    router.refresh()
  }

  async function decline(invitationId: string) {
    setPendingId(invitationId)
    const { error } = await authClient.organization.rejectInvitation({
      invitationId,
    })
    if (error) {
      toast.error(error.message ?? t("unableToDeclineInvitation"))
      setPendingId(null)
      return
    }
    setInvitations((prev) => prev.filter((item) => item.id !== invitationId))
    setPendingId(null)
  }

  async function createOrganization(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t("pleaseEnterOrganizationName"))
      return
    }
    const slug = slugify(trimmed)
    if (!slug) {
      setError(t("useLettersOrNumbers"))
      return
    }
    setSubmitting(true)
    setError(null)
    const { data, error } = await authClient.organization.create({
      name: trimmed,
      slug,
    })
    if (error) {
      setError(error.message ?? t("unableToCreateOrganization"))
      setSubmitting(false)
      return
    }
    toast.success(t("organizationCreated"))
    if (data?.slug && subscribeInterval) {
      router.push(`/${data.slug}/settings?tab=billing&subscribe=${subscribeInterval}`)
      router.refresh()
      return
    }
    router.push(data?.slug ? `/${data.slug}` : "/onboarding")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("welcome", { name: userName.split(" ")[0] ?? userName })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("onboardingDescription")}
        </p>
      </div>

      {invitations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailIcon className="size-4" />
              {t("pendingInvitations")}
            </CardTitle>
            <CardDescription>
              {t("pendingInvitationsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <Avatar className="size-9 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {getInitials(invitation.organizationName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {invitation.organizationName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("roleLabel", {
                      role: parseRoles(invitation.role)
                        .map((value) => L.orgRole(value))
                        .join(", "),
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={pendingId === invitation.id}
                    onClick={() => accept(invitation.id)}
                  >
                    {pendingId === invitation.id ? (
                      <Spinner />
                    ) : (
                      <CheckIcon data-icon="inline-start" />
                    )}
                    {t("accept")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendingId === invitation.id}
                    onClick={() => decline(invitation.id)}
                  >
                    <XIcon data-icon="inline-start" />
                    {t("decline")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2Icon className="size-4" />
            {t("createOrganizationTitle")}
          </CardTitle>
          <CardDescription>
            {t("createOrganizationDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createOrganization}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="organization-name">
                  {t("organizationName")}
                </FieldLabel>
                <Input
                  id="organization-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("organizationNamePlaceholder")}
                  autoFocus
                />
                <FieldDescription>
                  {name.trim()
                    ? t("workspaceUrl", { slug: slugify(name) })
                    : t("canChangeLater")}
                </FieldDescription>
              </Field>
              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
              <Field>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Spinner /> : null}
                  {submitting ? t("creating") : t("createOrganization")}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
