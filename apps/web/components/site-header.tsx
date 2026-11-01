"use client"

import * as React from "react"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { AppSwitcher } from "@/components/app-switcher"
import { CommandMenu } from "@/components/command-menu"
import { NavUser } from "@/components/nav-user"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { OrgSwitcher } from "@/components/organization/org-switcher"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"

import { usePathname } from "@workspace/i18n/navigation"
import type { NotificationsData } from "@/lib/notifications/types"
import { useProjectStore } from "@workspace/projects/store"

const titleKeys = {
  "": "assistant",
  "/projects": "projects",
  "/messages": "messages",
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
  const { getProject } = useProjectStore()

  const prefix = `/${orgSlug}`
  const relative = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname

  const titleKey = titleKeys[relative as keyof typeof titleKeys]
  if (titleKey !== undefined) return t(titleKey)
  if (relative.startsWith("/projects/")) {
    const projectId = relative.split("/")[2]
    return projectId
      ? (getProject(projectId)?.name ?? t("projects"))
      : t("projects")
  }
  return t("assistant")
}

export function SiteHeader({
  orgSlug,
  user,
  activeOrganizationId,
  notifications,
}: {
  orgSlug: string
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
  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const previousPathname = React.useRef(pathname)

  // Client-side navigation keeps focus on the clicked link; move it to the new page title.
  React.useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    titleRef.current?.focus()
  }, [pathname])

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
        <AppSwitcher orgSlug={orgSlug} />
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
          <NotificationBell orgSlug={orgSlug} initial={notifications} />
          <OrgSwitcher activeOrganizationId={activeOrganizationId} compact />
          <ThemeToggle ariaLabel={common("toggleTheme")} />
          <NavUser user={user} orgSlug={orgSlug} compact />
        </div>
      </div>
      <CommandMenu
        orgSlug={orgSlug}
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
      />
    </header>
  )
}
