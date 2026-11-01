import { getTranslations } from "next-intl/server"

import { AppearanceProvider } from "@workspace/app-shell/appearance"
import { ImpersonationBanner } from "@workspace/app-shell/impersonation-banner"
import { RecentsProvider } from "@workspace/app-shell/recents"
import { WorkspaceShell } from "@workspace/app-shell/shell"
import { appOrigin } from "@workspace/contracts/server"
import { EntitlementsProvider } from "@workspace/organization/use-entitlements"
import { toMemberDirectoryEntry } from "@workspace/organization/directory"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { MessagesSidebar } from "@/components/app-sidebar"
import { MessagesNavigationProvider } from "@/components/messages-navigation"
import { MessagingShellProvider } from "@/components/messaging-provider"
import { SiteHeader } from "@/components/site-header"
import { getOrganizationAppearance } from "@/lib/appearance"
import {
  requireMessagesWorkspace,
  toRequestContext,
} from "@/lib/auth/workspace"
import { messagingService } from "@/lib/messaging"
import { listUserOrganizations } from "@/lib/organization"
import { prisma } from "@/lib/prisma"

/**
 * The workspace shell for the messages host.
 *
 * Every request resolves the session, the organization and the plan here; the
 * conversation screens below never render without them. Messaging data is
 * loaded in this app — Copilot no longer mounts a messaging provider.
 */
export default async function OrgLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ locale: string; orgSlug: string }>
}>) {
  const { locale, orgSlug } = await params
  const workspace = await requireMessagesWorkspace({
    locale,
    orgSlug,
    returnTo: `/${locale}/${orgSlug}/messages`,
  })
  const ctx = toRequestContext(workspace)

  const [initialData, appearance, memberships, memberRows] = await Promise.all([
    messagingService.list(ctx),
    getOrganizationAppearance(workspace.organization.id),
    listUserOrganizations(workspace.user.id),
    prisma.member.findMany({
      where: { organizationId: workspace.organization.id, clientId: null },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  // Conversation members are user ids; organization members never carry the
  // client role, but the directory type keeps it for portal rows.
  const members = memberRows.map(toMemberDirectoryEntry).map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    avatarUrl: member.avatarUrl,
    role: (member.role === "client" ? "member" : member.role) as
      "owner" | "admin" | "member" | "viewer",
  }))

  const t = await getTranslations("Common")
  const copilotUrl = appOrigin("copilot")
  const projectsUrl = appOrigin("projects")
  const organizations = memberships.map(({ organization }) => organization)

  return (
    <TooltipProvider>
      <EntitlementsProvider entitlements={workspace.entitlements}>
        <AppearanceProvider
          initialAppearance={appearance}
          userId={workspace.user.id}
        >
          <RecentsProvider organizationId={workspace.organization.id}>
            <MessagesNavigationProvider>
              <MessagingShellProvider
                initialData={initialData}
                currentUserId={workspace.user.id}
                organizationId={workspace.organization.id}
                members={members}
              >
                <WorkspaceShell
                  skipLabel={t("skipToContent")}
                  sidebar={<MessagesSidebar orgSlug={orgSlug} />}
                  banners={
                    workspace.impersonatedBy ? (
                      <ImpersonationBanner name={workspace.user.name} />
                    ) : null
                  }
                  header={
                    <SiteHeader
                      locale={locale}
                      orgSlug={orgSlug}
                      organizations={organizations}
                      activeOrganizationId={workspace.organization.id}
                      user={workspace.user}
                      returnTo={`/${locale}/${orgSlug}/messages`}
                      copilotUrl={copilotUrl}
                      projectsUrl={projectsUrl}
                      accountUrl={`${copilotUrl}/${locale}/${orgSlug}/settings/account`}
                    />
                  }
                >
                  {children}
                </WorkspaceShell>
              </MessagingShellProvider>
            </MessagesNavigationProvider>
          </RecentsProvider>
        </AppearanceProvider>
      </EntitlementsProvider>
    </TooltipProvider>
  )
}
