"use client"

import * as React from "react"
import { useRouter } from "@workspace/i18n/navigation"
import { useTranslations } from "next-intl"
import { MailIcon } from "lucide-react"
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
import { Spinner } from "@workspace/ui/components/spinner"

import { authClient } from "@/lib/auth-client"
import { claimPortalAccessAction } from "@/actions/portal"
import { useEnumLabel } from "@workspace/i18n/labels"
import { parseRoles } from "@workspace/organization/roles"

interface InvitationDetails {
  organizationName: string
  organizationSlug: string
  inviterEmail: string
  role: string | null
  email: string
}

export function AcceptInvitationCard({
  invitationId,
}: {
  invitationId: string
}) {
  const router = useRouter()
  const t = useTranslations("Org")
  const L = useEnumLabel()
  const [invitation, setInvitation] = React.useState<InvitationDetails | null>(
    null
  )
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState<"accept" | "decline" | null>(null)

  React.useEffect(() => {
    let active = true
    async function load() {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      })
      if (!active) return
      if (error || !data) {
        setError(error?.message ?? t("invitationNotFound"))
        setLoading(false)
        return
      }
      setInvitation({
        organizationName: data.organizationName,
        organizationSlug: data.organizationSlug,
        inviterEmail: data.inviterEmail,
        role: data.role,
        email: data.email,
      })
      setLoading(false)
    }
    load().catch(() => {
      if (active) {
        setError(t("invitationNotFound"))
        setLoading(false)
      }
    })
    return () => {
      active = false
    }
  }, [invitationId])

  async function accept() {
    setPending("accept")
    const { error } = await authClient.organization.acceptInvitation({
      invitationId,
    })
    if (error) {
      toast.error(error.message ?? t("unableToAcceptInvitation"))
      setPending(null)
      return
    }
    // Client-portal invitations link the new member to the invited company.
    const claim = await claimPortalAccessAction({ invitationId })
    const isPortal = claim.ok && claim.data.portal
    toast.success(t("invitationAccepted"))
    router.push(
      isPortal
        ? "/portal"
        : invitation
          ? `/${invitation.organizationSlug}`
          : "/onboarding"
    )
    router.refresh()
  }

  async function decline() {
    setPending("decline")
    const { error } = await authClient.organization.rejectInvitation({
      invitationId,
    })
    if (error) {
      toast.error(error.message ?? t("unableToDeclineInvitation"))
      setPending(null)
      return
    }
    toast.success(t("invitationDeclined"))
    router.push("/onboarding")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailIcon className="size-4" />
          {t("organizationInvitation")}
        </CardTitle>
        <CardDescription>
          {loading
            ? t("loadingInvitation")
            : error
              ? error
              : t("invitedToJoin", { name: invitation?.organizationName ?? "" })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {invitation ? (
          <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm">
            <span className="font-medium">{invitation.organizationName}</span>
            <span className="text-muted-foreground">
              {t("invitedBy", { email: invitation.inviterEmail })}
            </span>
            <div className="mt-1">
              <Badge variant="secondary">
                {parseRoles(invitation.role)
                  .map((value) => L.orgRole(value))
                  .join(", ")}
              </Badge>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        ) : error ? null : (
          <div className="flex items-center gap-2">
            <Button
              className="flex-1"
              disabled={pending !== null}
              onClick={accept}
            >
              {pending === "accept" ? <Spinner /> : null}
              {t("accept")}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              disabled={pending !== null}
              onClick={decline}
            >
              {t("decline")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
