"use client"

import {
  BriefcaseIcon,
  CalendarIcon,
  CirclePlusIcon,
  CommandIcon,
  FileIcon,
  FolderIcon,
  HandshakeIcon,
  MessageSquareIcon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { ProjectFormDialog } from "@workspace/projects/components/project/project-dialog"
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
 * The projects app's sidebar.
 *
 * Only Projects belongs to this app; every other workspace section links to
 * Copilot (or the app that will own it after #161–#164) with an absolute URL,
 * so the split is visible and no cross-app route is faked here.
 */
export function ProjectSidebar({
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
    { icon: <MessageSquareIcon />, title: t("messages"), path: "/messages" },
    { icon: <CalendarIcon />, title: t("calendars"), path: "/calendars" },
    { icon: <FileIcon />, title: t("files"), path: "/files" },
    { icon: <HandshakeIcon />, title: t("clients"), path: "/clients" },
    { icon: <BriefcaseIcon />, title: t("employees"), path: "/employees" },
  ]

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}/projects`} prefetch={false} />}
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
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  render={
                    <Link href={`/${orgSlug}/projects`} prefetch={false} />
                  }
                >
                  <FolderIcon />
                  <span>{t("projects")}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <ProjectFormDialog
                  trigger={
                    <SidebarMenuButton
                      tooltip={t("quickCreate")}
                      className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                    >
                      <CirclePlusIcon />
                      <span>{t("quickCreate")}</span>
                    </SidebarMenuButton>
                  }
                />
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
