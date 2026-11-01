"use client"

import {
  BriefcaseIcon,
  CalendarCogIcon,
  CommandIcon,
  FileIcon,
  FolderIcon,
  HandshakeIcon,
  MessageSquareIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Link, usePathname } from "@workspace/i18n/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

import { CalendarsSidebar } from "@/components/calendars/calendars-sidebar"

/**
 * The calendars app's sidebar.
 *
 * Every other workspace section links to the app that owns it (`apps/projects`,
 * `apps/files`, Copilot for the rest), so the split stays visible and no
 * cross-app route is faked here. The calendar rail itself — mini calendar,
 * calendar sources and the attendee filter — is the primary navigation.
 */
export function AppSidebar({
  orgSlug,
  copilotUrl,
  projectsUrl,
  messagesUrl,
  filesUrl,
}: {
  orgSlug: string
  copilotUrl: string
  projectsUrl: string
  messagesUrl: string
  filesUrl: string
}) {
  const locale = useLocale()
  const t = useTranslations("Sidebar")
  const pathname = usePathname()

  const otherApps = [
    {
      icon: <SparklesIcon />,
      title: t("assistant"),
      url: `${copilotUrl}/${locale}/${orgSlug}`,
    },
    {
      icon: <FolderIcon />,
      title: t("projects"),
      url: `${projectsUrl}/${locale}/${orgSlug}/projects`,
    },
    {
      icon: <MessageSquareIcon />,
      title: t("messages"),
      // Messages is its own app since #162.
      url: `${messagesUrl}/${locale}/${orgSlug}/messages`,
    },
    {
      icon: <FileIcon />,
      title: t("files"),
      url: `${filesUrl}/${locale}/${orgSlug}/files`,
    },
    {
      icon: <HandshakeIcon />,
      title: t("clients"),
      url: `${copilotUrl}/${locale}/${orgSlug}/clients`,
    },
    {
      icon: <BriefcaseIcon />,
      title: t("employees"),
      url: `${copilotUrl}/${locale}/${orgSlug}/employees`,
    },
  ]

  const settingsActive = pathname.endsWith("/calendars/settings")

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}/calendars`} prefetch={false} />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Asynchrone Space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {otherApps.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton render={<a href={item.url} />}>
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={settingsActive}
                  render={
                    <Link
                      href={`/${orgSlug}/calendars/settings`}
                      prefetch={false}
                    />
                  }
                >
                  <Settings2Icon />
                  <span>{t("settings")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="min-h-0 flex-1 p-0">
          <SidebarGroupLabel className="sr-only">
            <CalendarCogIcon />
            {t("calendars")}
          </SidebarGroupLabel>
          <SidebarGroupContent className="h-full">
            <CalendarsSidebar />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
