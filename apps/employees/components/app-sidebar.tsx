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
 * The employees app's sidebar.
 *
 * Only Employees belongs to this app; every other workspace section links to
 * its own app (or Copilot while it still owns it) with an absolute URL, so the
 * split is visible and no cross-app route is faked here.
 */
export function EmployeeSidebar({
  orgSlug,
  copilotUrl,
}: {
  orgSlug: string
  copilotUrl: string
}) {
  const locale = useLocale()
  const t = useTranslations("Sidebar")

  const workspacePath = (path: string) =>
    `${copilotUrl}/${locale}/${orgSlug}${path}`

  const otherApps = [
    { icon: <SparklesIcon />, title: t("assistant"), path: "" },
    { icon: <FolderIcon />, title: t("projects"), path: "/projects" },
    { icon: <MessageSquareIcon />, title: t("messages"), path: "/messages" },
    { icon: <CalendarIcon />, title: t("calendars"), path: "/calendars" },
    { icon: <FileIcon />, title: t("files"), path: "/files" },
    { icon: <HandshakeIcon />, title: t("clients"), path: "/clients" },
  ]

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}/employees`} prefetch={false} />}
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
                  render={
                    <Link href={`/${orgSlug}/employees`} prefetch={false} />
                  }
                >
                  <BriefcaseIcon />
                  <span>{t("employees")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {otherApps.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<a href={workspacePath(item.path)} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
