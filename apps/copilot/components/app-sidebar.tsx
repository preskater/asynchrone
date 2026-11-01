"use client"

import {
  BriefcaseIcon,
  CalendarIcon,
  CircleHelpIcon,
  CommandIcon,
  FileIcon,
  FolderIcon,
  HandshakeIcon,
  MessageSquareHeartIcon,
  MessageSquareIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { CalendarsSidebar } from "@/components/calendars/calendars-sidebar"
import { FilesSidebar } from "@workspace/files/components/files-sidebar"
import { NavMain, type NavApp } from "@workspace/app-shell/nav-main"
import { NavSecondary } from "@workspace/ui/components/nav-secondary"
import { Link, usePathname } from "@workspace/i18n/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

export function useNavMain(
  orgSlug: string,
  projectsUrl: string,
  messagesUrl: string
): NavApp[] {
  const t = useTranslations("Sidebar")
  const locale = useLocale()
  return [
    {
      title: t("assistant"),
      url: `/${orgSlug}`,
      icon: <SparklesIcon />,
    },
    {
      key: "projects",
      title: t("projects"),
      // Projects is its own app since #160; link to its host.
      url: `${projectsUrl}/${locale}/${orgSlug}/projects`,
      icon: <FolderIcon />,
      external: true,
    },
    {
      key: "messages",
      title: t("messages"),
      // Messages is its own app since #162; link to its host.
      url: `${messagesUrl}/${locale}/${orgSlug}/messages`,
      icon: <MessageSquareIcon />,
      external: true,
    },
    {
      key: "calendars",
      title: t("calendars"),
      url: `/${orgSlug}/calendars`,
      icon: <CalendarIcon />,
    },
    {
      key: "files",
      title: t("files"),
      url: `/${orgSlug}/files`,
      icon: <FileIcon />,
    },
    {
      title: t("clients"),
      url: `/${orgSlug}/clients`,
      icon: <HandshakeIcon />,
      match: [`/${orgSlug}/contacts`, `/${orgSlug}/deals`],
    },
    {
      title: t("employees"),
      url: `/${orgSlug}/employees`,
      icon: <BriefcaseIcon />,
    },
  ]
}

export function useNavSecondary(orgSlug: string) {
  const t = useTranslations("Sidebar")
  return [
    {
      title: t("settings"),
      url: `/${orgSlug}/settings`,
      icon: <Settings2Icon />,
    },
    {
      title: t("search"),
      url: `/${orgSlug}/search`,
      icon: <SearchIcon />,
    },
    {
      title: t("feedback"),
      url: `/${orgSlug}/feedback`,
      icon: <MessageSquareHeartIcon />,
    },
    {
      title: t("getHelp"),
      url: `/${orgSlug}/help`,
      icon: <CircleHelpIcon />,
    },
  ]
}

export function AppSidebar({
  orgSlug,
  projectsUrl,
  messagesUrl,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  orgSlug: string
  /** Origin of the projects app (its own image and chart since #160). */
  projectsUrl: string
  /** Origin of the messages app (its own image and chart since #162). */
  messagesUrl: string
}) {
  const pathname = usePathname()
  const navMain = useNavMain(orgSlug, projectsUrl, messagesUrl)
  const navSecondary = useNavSecondary(orgSlug)

  const prefix = `/${orgSlug}`
  const relative = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname

  const contextual =
    relative === "/files" || relative.startsWith("/files/") ? (
      <FilesSidebar />
    ) : relative === "/calendars" || relative.startsWith("/calendars/") ? (
      <CalendarsSidebar />
    ) : null

  if (contextual) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarContent>{contextual}</SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}`} prefetch={false} />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Asynchrone Space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} orgSlug={orgSlug} messagesUrl={messagesUrl} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
