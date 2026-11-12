"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Building2Icon, MailIcon, UsersIcon } from "lucide-react"

import { AuditLogPanel } from "@/components/audit/audit-log-panel"
import { ApiTokensPanel } from "@/components/organization/api-tokens-panel"
import { DashboardEmpty } from "@/components/dashboard-empty"
import {
  BillingPanel,
  type CheckoutReturn,
} from "@/components/billing/billing-panel"
import { OrganizationAppearanceForm } from "@/components/appearance/organization-appearance-form"
import { OrganizationDangerZone } from "@/components/organization/danger-zone"
import { InvitationsTable } from "@/components/organization/invitations-table"
import { InviteMemberDialog } from "@/components/organization/invite-member-dialog"
import { MembersTable } from "@/components/organization/members-table"
import { OrganizationGeneralForm } from "@/components/organization/organization-general-form"
import {
  TwoFactorPolicyCard,
  type TwoFactorPolicy,
} from "@/components/organization/two-factor-policy-card"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { RolesGuide } from "@/components/organization/roles-guide"
import { authClient } from "@/lib/auth-client"
import { parseRoles } from "@workspace/organization/roles"
import { useEntitlements } from "@/lib/organization/use-entitlements"
import { useOrgPermissions } from "@/lib/organization/use-permissions"

/** Tab ids are part of the URL (`?tab=billing`), so links can deep-link here. */
const TAB_IDS = [
  "general",
  "billing",
  "appearance",
  "meetings",
  "members",
  "invitations",
  "audit",
  "developers",
  "danger",
] as const
type TabId = (typeof TAB_IDS)[number]

function resolveTab(value: string | null, fallback: TabId): TabId {
  return TAB_IDS.includes(value as TabId) ? (value as TabId) : fallback
}

export function OrganizationSettings({
  checkout,
  deletionScheduledAt,
  twoFactorPolicy,
  exportCard,
  calendarsUrl,
}: {
  checkout?: CheckoutReturn
  deletionScheduledAt: Date | null
  /** Owners and admins only; null hides the card. */
  twoFactorPolicy: TwoFactorPolicy | null
  /** Server-rendered, owner-only data export card for the General tab. */
  exportCard?: React.ReactNode
  /** Origin of the calendars app, which owns the meeting settings (#161). */
  calendarsUrl: string
}) {
  const t = useTranslations("Org")
  const tAudit = useTranslations("Audit")
  const tAppearance = useTranslations("Appearance")
  const tMeetings = useTranslations("MeetingRequests")
  const locale = useLocale()
  const permissions = useOrgPermissions()
  const entitlements = useEntitlements()
  // Tabs follow capabilities: a developer sees neither billing, appearance nor
  // invitations; the server re-checks every action.
  const visibleTabs = new Set<TabId>(
    TAB_IDS.filter(
      (tab) =>
        (tab !== "billing" || permissions.can("billing:manage")) &&
        (tab !== "appearance" || permissions.can("appearance:update")) &&
        (tab !== "invitations" || permissions.can("member:manage")) &&
        (tab !== "audit" || permissions.can("audit:read")) &&
        (tab !== "developers" || permissions.can("workspace:read"))
    )
  )
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  // Returning from Stripe keeps `checkout`/`session_id` but no `tab`, so the
  // billing panel must be the one that mounts to finish the checkout.
  const requestedTab = resolveTab(
    searchParams.get("tab"),
    checkout ? "billing" : "general"
  )
  const activeTab = visibleTabs.has(requestedTab) ? requestedTab : "general"

  function changeTab(value: string) {
    const tab = resolveTab(value, "general")
    const next = new URLSearchParams(searchParams.toString())
    if (tab === "general") {
      next.delete("tab")
    } else {
      next.set("tab", tab)
    }
    const query = next.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    })
  }
  const {
    data: organization,
    isPending,
    error,
    refetch,
  } = authClient.useActiveOrganization()
  const { data: session } = authClient.useSession()

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  if (error || !organization) {
    return (
      <DashboardEmpty
        icon={Building2Icon}
        title={t("noActiveOrganization")}
        description={t("noActiveOrganizationDescription")}
        className="border"
      />
    )
  }

  const members = organization.members ?? []
  const invitations = organization.invitations ?? []
  const owners = members.filter((member) =>
    parseRoles(member.role).includes("owner")
  )
  const currentUserId = session?.user.id
  const isOnlyOwner =
    owners.length <= 1 &&
    owners.some((member) => member.userId === currentUserId)

  return (
    <Tabs
      value={activeTab}
      onValueChange={changeTab}
      className="flex flex-col gap-4"
    >
      <TabsList
        variant="line"
        className="w-full justify-start overflow-x-auto overflow-y-hidden border-b pb-0"
      >
        <TabsTrigger value="general">{t("general")}</TabsTrigger>
        {visibleTabs.has("billing") ? (
          <TabsTrigger value="billing">{t("billing")}</TabsTrigger>
        ) : null}
        {visibleTabs.has("appearance") ? (
          <TabsTrigger value="appearance">{tAppearance("title")}</TabsTrigger>
        ) : null}
        <TabsTrigger value="meetings">{tMeetings("settingsTitle")}</TabsTrigger>
        <TabsTrigger value="members">{t("members")}</TabsTrigger>
        {visibleTabs.has("invitations") ? (
          <TabsTrigger value="invitations">{t("invitations")}</TabsTrigger>
        ) : null}
        {visibleTabs.has("audit") ? (
          <TabsTrigger value="audit">{tAudit("tab")}</TabsTrigger>
        ) : null}
        {visibleTabs.has("developers") ? (
          <TabsTrigger value="developers">{t("apiTokens.tab")}</TabsTrigger>
        ) : null}
        <TabsTrigger value="danger">{t("dangerZone")}</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <OrganizationGeneralForm
          organization={organization}
          canEdit={permissions.canUpdateOrganization}
          onSaved={refetch}
        />
        {exportCard ? <div className="mt-4">{exportCard}</div> : null}
      </TabsContent>

      <TabsContent value="billing">
        <BillingPanel checkout={checkout} />
      </TabsContent>

      <TabsContent value="appearance">
        <OrganizationAppearanceForm />
      </TabsContent>

      <TabsContent value="meetings">
        <Card>
          <CardHeader>
            <CardTitle>{tMeetings("settingsTitle")}</CardTitle>
            <CardDescription>
              {tMeetings("settingsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={`${calendarsUrl}/${locale}/${organization.slug}/calendars/settings`}
                />
              }
            >
              {tMeetings("openSettings")}
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="members" className="flex flex-col gap-4">
        {twoFactorPolicy ? (
          <TwoFactorPolicyCard policy={twoFactorPolicy} />
        ) : null}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <UsersIcon className="size-4" />
                  {t("members")}
                </CardTitle>
                <CardDescription>
                  {t("membersDescription", { name: organization.name })}
                </CardDescription>
              </div>
              {permissions.canInviteMember ? (
                <InviteMemberDialog onInvited={refetch} />
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <MembersTable
              members={members}
              currentUserId={currentUserId ?? ""}
              canUpdate={permissions.canUpdateMember}
              canRemove={permissions.canDeleteMember}
              canTransferOwnership={permissions.isOwner}
              multipleRoles={entitlements.can("granularPermissions")}
              onChanged={refetch}
            />
          </CardContent>
        </Card>
        <RolesGuide />
      </TabsContent>

      <TabsContent value="invitations">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="flex items-center gap-2">
                  <MailIcon className="size-4" />
                  {t("invitations")}
                </CardTitle>
                <CardDescription>{t("invitationsDescription")}</CardDescription>
              </div>
              {permissions.canInviteMember ? (
                <InviteMemberDialog onInvited={refetch} />
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <InvitationsTable
              invitations={invitations}
              canCancel={permissions.canCancelInvitation}
              onChanged={refetch}
            />
          </CardContent>
        </Card>
      </TabsContent>

      {visibleTabs.has("audit") ? (
        <TabsContent value="audit">
          <AuditLogPanel
            organizationName={organization.name}
            isOwner={permissions.isOwner}
          />
        </TabsContent>
      ) : null}

      {visibleTabs.has("developers") ? (
        <TabsContent value="developers">
          <ApiTokensPanel
            currentUserId={currentUserId ?? ""}
            showOwner={permissions.can("member:manage")}
          />
        </TabsContent>
      ) : null}

      <TabsContent value="danger">
        <OrganizationDangerZone
          organization={organization}
          isOwner={permissions.isOwner}
          isOnlyOwner={isOnlyOwner}
          deletionScheduledAt={deletionScheduledAt}
        />
      </TabsContent>
    </Tabs>
  )
}
