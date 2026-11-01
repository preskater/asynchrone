"use client"

import {
  BriefcaseIcon,
  CalendarIcon,
  CommandIcon,
  FileIcon,
  FolderIcon,
  HandshakeIcon,
  MessageSquareIcon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { FilesSidebar } from "@workspace/files/components/files-sidebar"
import { Link } from "@workspace/i18n/navigation"
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

/**
 * The files app's sidebar.
 *
 * The file locations (my files, shared, recent, trash) are the primary
 * navigation; every other workspace section links to the app that owns it so
 * the split stays visible and no cross-app route is faked here.
 */
export function AppSidebar({
  orgSlug,
  copilotUrl,
  projectsUrl,
  messagesUrl,
  calendarsUrl,
}: {
  orgSlug: string
  copilotUrl: string
  projectsUrl: string
  messagesUrl: string
  calendarsUrl: string
}) {
  const locale = useLocale()
  const t = useTranslations("Sidebar")

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
      icon: <CalendarIcon />,
      title: t("calendars"),
      url: `${calendarsUrl}/${locale}/${orgSlug}/calendars`,
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

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}/files`} prefetch={false} />}
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  render={<Link href={`/${orgSlug}/files`} prefetch={false} />}
                >
                  <FileIcon />
                  <span>{t("files")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {otherApps.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton render={<a href={item.url} />}>
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="min-h-0 flex-1 p-0">
          <SidebarGroupLabel className="sr-only">
            {t("files")}
          </SidebarGroupLabel>
          <SidebarGroupContent className="h-full">
            <FilesSidebar />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
