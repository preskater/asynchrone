"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { HelpMenu } from "@workspace/app-shell/support"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"

import { OrgSwitcher, type OrganizationChoice } from "@/components/org-switcher"
import { UserMenu } from "@/components/user-menu"

/** The calendars host header: title, organization switch, theme and account. */
export function SiteHeader({
  title,
  organizations,
  activeOrganizationId,
  user,
  returnTo,
  accountUrl,
}: {
  title: string
  organizations: OrganizationChoice[]
  activeOrganizationId: string
  user: { name: string; email: string; image?: string | null }
  returnTo: string
  accountUrl: string
}) {
  const t = useTranslations("Common")
  const titleRef = React.useRef<HTMLHeadingElement>(null)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ms-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="truncate text-base font-medium outline-none"
        >
          {title}
        </h1>
        <div className="ms-auto flex items-center gap-1">
          <OrgSwitcher
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
            returnTo={returnTo}
          />
          <HelpMenu />
          <ThemeToggle ariaLabel={t("toggleTheme")} />
          <UserMenu user={user} accountUrl={accountUrl} />
        </div>
      </div>
    </header>
  )
}
