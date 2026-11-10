"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { AppSwitcher } from "@/components/app-switcher"
import type { DomainAppUrls } from "@/components/app-sidebar"
import { CommandMenu } from "@/components/command-menu"
import { NavUser } from "@/components/nav-user"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { OrgSwitcher } from "@/components/organization/org-switcher"
import { HelpMenu } from "@workspace/app-shell/support"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"
import { useTitleFocus } from "@workspace/app-shell/title-focus"

import { usePathname } from "@workspace/i18n/navigation"
import type { NotificationsData } from "@/lib/notifications/types"

const titleKeys = {
  "": "assistant",
  "/projects": "projects",
  "/calendars": "calendars",
  "/files": "files",
  "/employees": "employees",
  "/settings/account": "account",
  "/settings": "settings",
  "/search": "search",
  "/help": "getHelp",
} as const satisfies Record<string, string>

function usePageTitle(orgSlug: string, pathname: string) {
  const t = useTranslations("Sidebar")

  const prefix = `/${orgSlug}`
  const relative = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname

  const titleKey = titleKeys[relative as keyof typeof titleKeys]
  return titleKey === undefined ? t("assistant") : t(titleKey)
}

export function SiteHeader({
  orgSlug,
  domainApps,
  user,
  activeOrganizationId,
  notifications,
}: {
  orgSlug: string
  /** Origins of the domain apps that own their own host (#160–#162). */
  domainApps: DomainAppUrls
  user: {
    name: string
    email: string
    image?: string | null
  }
  activeOrganizationId: string | null
  notifications: NotificationsData
}) {
  const pathname = usePathname()
  const title = usePageTitle(orgSlug, pathname)
  const t = useTranslations("Sidebar")
  const common = useTranslations("Common")
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const titleRef = useTitleFocus()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ms-1" />
        <Separator
          orientation="vertical"
          className="mx-2 h-4 data-vertical:self-auto"
        />
        <AppSwitcher orgSlug={orgSlug} domainApps={domainApps} />
        <Separator
          orientation="vertical"
          className="mx-2 hidden h-4 sm:block data-vertical:self-auto"
        />
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="truncate text-base font-medium outline-none max-sm:sr-only"
        >
          {title}
        </h1>
        <div className="ms-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={() => setPaletteOpen(true)}
          >
            <SearchIcon />
            <span className="hidden md:inline">{t("search")}</span>
            <kbd className="hidden rounded border px-1 font-sans text-[10px] md:inline">
              ⌘K
            </kbd>
          </Button>
          <NotificationBell
            orgSlug={orgSlug}
            clientsUrl={domainApps.clients}
            initial={notifications}
          />
          <OrgSwitcher activeOrganizationId={activeOrganizationId} compact />
          <HelpMenu />
          <ThemeToggle ariaLabel={common("toggleTheme")} />
          <NavUser user={user} orgSlug={orgSlug} compact />
        </div>
      </div>
      <CommandMenu
        orgSlug={orgSlug}
        domainApps={domainApps}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </header>
  )
}
